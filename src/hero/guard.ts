import ts from 'typescript';
import {
  HERO_BANNED_IDENTIFIERS,
  HERO_BANNED_MEMBERS,
  HERO_MAX_SOURCE_CHARS,
  HERO_MODULES,
  HERO_TAGS,
  isBannedProp,
  isUnsafeString,
} from './policy';

/**
 * Compile a model-written hero scene (TSX) into the JS the renderer loads —
 * or refuse it, with errors written FOR THE MODEL: each one names the line and
 * says what to do instead, because the same text is fed back into the retry.
 *
 * Node-only (imports the TypeScript compiler). Never imported by the
 * composition tree; server.ts exposes it as POST /hero/compile.
 *
 * The output is CommonJS with the JSX factory renamed to `__h` / `__F` and
 * every computed key routed through `__k` — the browser runtime supplies all
 * three (runtime.tsx). Identifiers starting with `__` are reserved so a scene
 * cannot shadow or call them itself.
 */

export interface HeroCompileResult {
  ok: boolean;
  js?: string;
  errors: string[];
  warnings: string[];
}

const lineOf = (sf: ts.SourceFile, node: ts.Node): number =>
  sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

/** Is this identifier occurrence a NAME (a.b's b, an object key, a JSX attr) rather than a reference? */
const isNamePosition = (node: ts.Identifier): boolean => {
  const p = node.parent;
  if (!p) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === node) return true;
  if ((ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p)
    || ts.isGetAccessorDeclaration(p) || ts.isSetAccessorDeclaration(p) || ts.isPropertySignature(p)) && p.name === node) {
    return true;
  }
  if (ts.isJsxAttribute(p) && p.name === node) return true;
  if (ts.isBindingElement(p) && p.propertyName === node) return true;
  if (ts.isImportSpecifier(p) && p.propertyName === node) return true;
  if (ts.isQualifiedName(p) && p.right === node) return true;
  return false;
};

// ---- scope resolution -------------------------------------------------------
//
// `top`, `origin`, `parent`, `open`, `screen`… are browser globals AND the
// names a motion designer gives a layout variable. Refusing the word would
// reject good scenes; allowing it would let `top.fetch` through. So the check
// is on what the name RESOLVES to: a banned name is only an error where no
// enclosing scope declares it — i.e. where it would reach the global.

const addBindingNames = (name: ts.BindingName, out: Set<string>): void => {
  if (ts.isIdentifier(name)) {
    out.add(name.text);
    return;
  }
  for (const el of name.elements) {
    if (ts.isBindingElement(el)) addBindingNames(el.name, out);
  }
};

const isLexical = (list: ts.VariableDeclarationList): boolean =>
  (list.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) !== 0;

/** `var` declarations and top-level function declarations hoisted to a function (or file) scope. */
const collectHoisted = (body: ts.Node, out: Set<string>, top = true): void => {
  ts.forEachChild(body, (child) => {
    if (ts.isFunctionLike(child) || ts.isClassLike(child)) {
      if (top && ts.isFunctionDeclaration(child) && child.name) out.add(child.name.text);
      return;
    }
    if (ts.isVariableDeclarationList(child) && !isLexical(child)) {
      child.declarations.forEach((d) => addBindingNames(d.name, out));
    }
    collectHoisted(child, out, false);
  });
};

/** Lexical declarations made directly in a block-like list of statements. */
const collectLexical = (statements: readonly ts.Statement[], out: Set<string>): void => {
  for (const st of statements) {
    if (ts.isVariableStatement(st) && isLexical(st.declarationList)) {
      st.declarationList.declarations.forEach((d) => addBindingNames(d.name, out));
    } else if ((ts.isClassDeclaration(st) || ts.isFunctionDeclaration(st)) && st.name) {
      out.add(st.name.text);
    } else if (ts.isImportDeclaration(st) && st.importClause) {
      const c = st.importClause;
      if (c.name) out.add(c.name.text);
      const b = c.namedBindings;
      if (b && ts.isNamespaceImport(b)) out.add(b.name.text);
      if (b && ts.isNamedImports(b)) b.elements.forEach((e) => out.add(e.name.text));
    }
  }
};

/** Identifier nodes that name a banned global WITHOUT a local declaration in scope. */
const unboundBanned = (sf: ts.SourceFile): Set<ts.Node> => {
  const hits = new Set<ts.Node>();
  const stack: Set<string>[] = [];
  const bound = (name: string): boolean => stack.some((scope) => scope.has(name));

  const walk = (node: ts.Node): void => {
    // Types never run.
    if (ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;

    let scope: Set<string> | null = null;
    if (ts.isSourceFile(node)) {
      scope = new Set();
      collectHoisted(node, scope);
      collectLexical(node.statements, scope);
    } else if (ts.isFunctionLike(node)) {
      scope = new Set();
      node.parameters.forEach((p) => addBindingNames(p.name, scope!));
      if ((ts.isFunctionExpression(node) || ts.isClassExpression(node)) && node.name) scope.add(node.name.text);
      const body = (node as ts.FunctionLikeDeclaration).body;
      if (body) collectHoisted(body, scope);
    } else if (ts.isBlock(node) || ts.isModuleBlock(node)) {
      scope = new Set();
      collectLexical(node.statements, scope);
    } else if (ts.isCaseBlock(node)) {
      scope = new Set();
      node.clauses.forEach((c) => collectLexical(c.statements, scope!));
    } else if ((ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node))
      && node.initializer && ts.isVariableDeclarationList(node.initializer)) {
      scope = new Set();
      node.initializer.declarations.forEach((d) => addBindingNames(d.name, scope!));
    } else if (ts.isCatchClause(node) && node.variableDeclaration) {
      scope = new Set();
      addBindingNames(node.variableDeclaration.name, scope);
    } else if (ts.isClassExpression(node) && node.name) {
      scope = new Set([node.name.text]);
    }

    if (scope) stack.push(scope);
    if (ts.isIdentifier(node) && HERO_BANNED_IDENTIFIERS.has(node.text) && !isNamePosition(node) && !bound(node.text)) {
      hits.add(node);
    }
    ts.forEachChild(node, walk);
    if (scope) stack.pop();
  };

  walk(sf);
  return hits;
};

const staticChecks = (sf: ts.SourceFile): { errors: string[]; warnings: string[]; hasDefault: boolean } => {
  const freeBanned = unboundBanned(sf);
  const errors: string[] = [];
  const warnings: string[] = [];
  let hasDefault = false;
  let nodes = 0;
  const err = (node: ts.Node, msg: string) => errors.push(`line ${lineOf(sf, node)}: ${msg}`);

  const visit = (node: ts.Node): void => {
    nodes++;

    // ---- modules -----------------------------------------------------------
    if (ts.isImportDeclaration(node)) {
      const spec = (node.moduleSpecifier as ts.StringLiteral).text;
      const allowed = HERO_MODULES[spec];
      if (!allowed) {
        err(node, `import from "${spec}" is not allowed — import only from "remotion" and "hero-kit".`);
      } else {
        const clause = node.importClause;
        if (clause?.name && !allowed.includes('default')) {
          err(node, `"${spec}" has no default export you may use.`);
        }
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) {
          err(node, `use named imports from "${spec}" (no "* as").`);
        } else if (bindings && ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) {
            const name = (el.propertyName ?? el.name).text;
            if (!allowed.includes(name)) {
              err(el, `"${name}" is not available from "${spec}". Available: ${allowed.filter((a) => a !== 'default').join(', ')}.`);
            }
          }
        }
      }
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      err(node, 'no re-exports.');
    }
    if (ts.isExportAssignment(node) && !node.isExportEquals) hasDefault = true;
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node))
      && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
      hasDefault = true;
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      err(node, 'dynamic import() is not allowed.');
    }
    if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
      err(node, 'import.meta is not allowed.');
    }

    // ---- names -------------------------------------------------------------
    if (ts.isIdentifier(node)) {
      const t = node.text;
      if (t.startsWith('__')) {
        err(node, `names starting with "__" are reserved ("${t}").`);
      } else if (freeBanned.has(node)) {
        err(node, `"${t}" is not available in a scene (no network, DOM, timers, wall-clock time or eval). Use the frame number for time and remotion's random(seed) for randomness.`);
      }
    }
    if (ts.isPropertyAccessExpression(node)) {
      const name = node.name.text;
      if (HERO_BANNED_MEMBERS.has(name)) {
        err(node, `".${name}" is not allowed.`);
      }
      if (name === 'random' && ts.isIdentifier(node.expression) && node.expression.text === 'Math') {
        err(node, 'Math.random() makes every frame different — use random(seed) from "remotion" (deterministic).');
      }
    }
    if (ts.isElementAccessExpression(node)) {
      const a = node.argumentExpression;
      if ((ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) && HERO_BANNED_MEMBERS.has(a.text)) {
        err(node, `["${a.text}"] is not allowed.`);
      }
    }
    if ((ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node)) && node.name) {
      const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null;
      if (key && HERO_BANNED_MEMBERS.has(key)) err(node, `object key "${key}" is not allowed.`);
    }
    if (ts.isBindingElement(node) && node.propertyName) {
      if (ts.isComputedPropertyName(node.propertyName)) {
        err(node, 'computed keys in destructuring are not allowed.');
      } else if ((ts.isIdentifier(node.propertyName) || ts.isStringLiteral(node.propertyName))
        && HERO_BANNED_MEMBERS.has(node.propertyName.text)) {
        err(node, `destructuring "${node.propertyName.text}" is not allowed.`);
      }
    }
    if (ts.isBindingElement(node) && !node.propertyName && ts.isIdentifier(node.name)
      && ts.isObjectBindingPattern(node.parent) && HERO_BANNED_MEMBERS.has(node.name.text)) {
      err(node, `destructuring "${node.name.text}" is not allowed.`);
    }

    // ---- strings -----------------------------------------------------------
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && isUnsafeString(node.text)) {
      // Import specifiers are strings too; they were judged above.
      if (!ts.isImportDeclaration(node.parent)) {
        err(node, 'strings may not contain URLs, url(…) other than url(#id), or schemes — draw everything with SVG/CSS.');
      }
    }
    if (ts.isTemplateExpression(node)) {
      const parts = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join('\u0000');
      if (isUnsafeString(parts.replace(/\u0000/g, ''))) {
        err(node, 'template strings may not build URLs or url(…) other than url(#id).');
      }
    }

    // ---- JSX ---------------------------------------------------------------
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName;
      if (ts.isIdentifier(tag) && /^[a-z]/.test(tag.text) && !HERO_TAGS.has(tag.text)) {
        err(node, `<${tag.text}> is not allowed. Allowed: div/span/p/h1-h4/strong/em/svg and SVG shapes, gradients, masks, clipPath, filters.`);
      }
      if (ts.isJsxNamespacedName(tag as ts.Node)) {
        err(node, 'namespaced JSX tags are not allowed.');
      }
    }
    if (ts.isJsxAttribute(node)) {
      const name = ts.isIdentifier(node.name) ? node.name.text : `${node.name.namespace.text}:${node.name.name.text}`;
      if (isBannedProp(name)) {
        err(node, `prop "${name}" is not allowed (no refs, event handlers, links or external sources).`);
      }
    }

    // ---- control flow ------------------------------------------------------
    const asyncFn = ts.canHaveModifiers(node)
      && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    if (ts.isAwaitExpression(node) || asyncFn) {
      err(node, 'no async code — a scene renders synchronously, one frame at a time.');
    }
    if (node.kind === ts.SyntaxKind.WithStatement || node.kind === ts.SyntaxKind.DebuggerStatement) {
      err(node, `"${ts.SyntaxKind[node.kind]}" is not allowed.`);
    }
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      warnings.push(`line ${lineOf(sf, node)}: prefer function components over classes.`);
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
  if (nodes > 30000) errors.push('the scene is too large — keep it under ~400 lines.');

  return { errors, warnings, hasDefault };
};

/**
 * The emit-time transform: computed keys go through `__k` (refuses the banned
 * member names whatever string builds them), and every loop is bounded.
 */
const heroTransformer: ts.TransformerFactory<ts.SourceFile> = (ctx) => {
  const f = ctx.factory;

  // Every loop body first calls __L(): ONE iteration budget shared by every
  // loop in the scene and reset each frame (runtime.tsx). A per-loop counter
  // is not enough — two nested loops of 200k each are 4e10 iterations, and
  // that hung the page until the render timed out (hero bench, 2026-10-03).
  const guardLoopBody = (body: ts.Statement): ts.Statement => {
    const tick = f.createExpressionStatement(f.createCallExpression(f.createIdentifier('__L'), undefined, []));
    const stmts = ts.isBlock(body) ? [tick, ...body.statements] : [tick, body];
    return f.createBlock(stmts, true);
  };

  const wrapLoop = (loop: ts.IterationStatement, rebuilt: (body: ts.Statement) => ts.Statement): ts.Statement =>
    rebuilt(guardLoopBody(loop.statement));

  // Every FUNCTION body ticks the same budget. Loops were the obvious way to
  // spin a frame forever; `.map` callbacks over a huge array and plain
  // recursion are the others — and since the MCP studio lets any signed-in
  // user submit scene code, all three have to be bounded.
  const tickedBody = (body: ts.ConciseBody): ts.Block => {
    const tick = f.createExpressionStatement(f.createCallExpression(f.createIdentifier('__L'), undefined, []));
    if (ts.isBlock(body)) return f.updateBlock(body, [tick, ...body.statements]);
    return f.createBlock([tick, f.createReturnStatement(body)], true);
  };

  const visit = (node: ts.Node): ts.Node => {
    const n = ts.visitEachChild(node, visit, ctx);

    if (ts.isElementAccessExpression(n)) {
      const arg = n.argumentExpression;
      if (!ts.isNumericLiteral(arg)) {
        const guarded = f.createCallExpression(f.createIdentifier('__k'), undefined, [arg]);
        return n.questionDotToken
          ? f.updateElementAccessChain(n as ts.ElementAccessChain, n.expression, n.questionDotToken, guarded)
          : f.updateElementAccessExpression(n, n.expression, guarded);
      }
    }
    if (ts.isArrowFunction(n)) {
      return f.updateArrowFunction(n, n.modifiers, n.typeParameters, n.parameters, n.type, n.equalsGreaterThanToken, tickedBody(n.body));
    }
    if (ts.isFunctionExpression(n) && n.body) {
      return f.updateFunctionExpression(n, n.modifiers, n.asteriskToken, n.name, n.typeParameters, n.parameters, n.type, tickedBody(n.body));
    }
    if (ts.isFunctionDeclaration(n) && n.body) {
      return f.updateFunctionDeclaration(n, n.modifiers, n.asteriskToken, n.name, n.typeParameters, n.parameters, n.type, tickedBody(n.body));
    }
    if (ts.isMethodDeclaration(n) && n.body) {
      return f.updateMethodDeclaration(n, n.modifiers, n.asteriskToken, n.name, n.questionToken, n.typeParameters, n.parameters, n.type, tickedBody(n.body));
    }
    if (ts.isWhileStatement(n)) return wrapLoop(n, (b) => f.updateWhileStatement(n, n.expression, b));
    if (ts.isDoStatement(n)) return wrapLoop(n, (b) => f.updateDoStatement(n, b, n.expression));
    if (ts.isForStatement(n)) return wrapLoop(n, (b) => f.updateForStatement(n, n.initializer, n.condition, n.incrementor, b));
    if (ts.isForOfStatement(n)) return wrapLoop(n, (b) => f.updateForOfStatement(n, n.awaitModifier, n.initializer, n.expression, b));
    if (ts.isForInStatement(n)) return wrapLoop(n, (b) => f.updateForInStatement(n, n.initializer, n.expression, b));
    return n;
  };

  return (sf) => ts.visitNode(sf, visit) as ts.SourceFile;
};

export const compileHero = (source: string): HeroCompileResult => {
  if (typeof source !== 'string' || source.trim() === '') {
    return { ok: false, errors: ['no code was returned.'], warnings: [] };
  }
  if (source.length > HERO_MAX_SOURCE_CHARS) {
    return { ok: false, errors: [`the scene is ${source.length} characters — keep it under ${HERO_MAX_SOURCE_CHARS}.`], warnings: [] };
  }

  const sf = ts.createSourceFile('hero.tsx', source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
  const { errors, warnings, hasDefault } = staticChecks(sf);
  if (!hasDefault) errors.push('the module must `export default function Scene()`.');

  const out = ts.transpileModule(source, {
    fileName: 'hero.tsx',
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2019,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      jsxFactory: '__h',
      jsxFragmentFactory: '__F',
      esModuleInterop: false,
      isolatedModules: true,
      removeComments: true,
    },
    transformers: { before: [heroTransformer] },
  });
  for (const d of out.diagnostics ?? []) {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    const line = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : '?';
    errors.push(`line ${line}: syntax — ${msg}`);
  }

  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 25), warnings };
  return { ok: true, js: out.outputText, errors: [], warnings };
};
