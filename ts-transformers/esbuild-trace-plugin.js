import ts from 'typescript';
import path from 'path';
import fs from 'fs/promises';

export default {
  name: 'trace-all-functions',
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async (args) => {
      if (args.path.includes('/telemetry/') || args.path.includes('\\telemetry\\')) {
        return; // skip telemetry folder
      }

      const sourceText = await fs.readFile(args.path, 'utf8');
      const result = transformFile(sourceText, args.path);
      return {
        contents: result,
        loader: 'ts'
      };
    });
  }
};

function transformFile(sourceText, filePath) {
  const moduleName = path.basename(filePath).replace(/\.[tj]s$/, '');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.ES2022, true);
  const factory = ts.factory;
  const printer = ts.createPrinter();
  const newStatements = [];
  let wrapFnInjected = false;

  function injectWrapFnImport() {
    if (wrapFnInjected) return;
    wrapFnInjected = true;
    newStatements.unshift(
      factory.createImportDeclaration(
        undefined,
        factory.createImportClause(false, undefined, factory.createNamedImports([
          factory.createImportSpecifier(false, undefined, factory.createIdentifier('wrapFn'))
        ])),
        factory.createStringLiteral('./telemetry/trace-wrapper.js')
      )
    );
  }

  function shouldSkip(node) {
    // 1. JSDoc still supported
    // console.log(node)
    console.log(Object.keys(node.body))
    if (node.jsDoc && node.jsDoc.some(doc => doc.comment?.includes('no-trace'))) {
      return true;
    }
  
    // 2. Check inside function body for // no-trace
    if (node.body && ts.isBlock(node.body)) {
      const bodyText = node.body.getFullText();
  
      return bodyText.includes('no-trace');
    }
  
    // 3. For arrow functions stored in consts:
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const text = node.body.getFullText?.() ?? '';
      return text.includes('no-trace');
    }
  
    return false;
  }

  function wrapFunction(name, implExpr, isExported) {
    injectWrapFnImport();
    const statements = [];

    if (!ts.isIdentifier(implExpr)) {
      const implDecl = factory.createVariableStatement(
        undefined,
        factory.createVariableDeclarationList([
          factory.createVariableDeclaration(
            `${name}Impl`,
            undefined,
            undefined,
            implExpr
          )
        ], ts.NodeFlags.Const)
      );
      statements.push(implDecl);
    }

    const wrapped = factory.createVariableStatement(
      isExported ? [factory.createModifier(ts.SyntaxKind.ExportKeyword)] : undefined,
      factory.createVariableDeclarationList([
        factory.createVariableDeclaration(
          name,
          undefined,
          undefined,
          factory.createCallExpression(
            factory.createIdentifier('wrapFn'),
            undefined,
            [
              factory.createIdentifier(`${name}Impl`),
              factory.createObjectLiteralExpression([
                factory.createPropertyAssignment('name', factory.createStringLiteral(`${moduleName}.${name}`))
              ])
            ]
          )
        )
      ], ts.NodeFlags.Const)
    );

    statements.push(wrapped);
    return statements;
  }

  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name && !shouldSkip(node)) {
      console.log(node.name.text)
      const implName = factory.createIdentifier(`${node.name.text}Impl`);
      const isExported = !!node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);

      const updatedFn = factory.updateFunctionDeclaration(
        node,
        node.modifiers?.filter(m => m.kind !== ts.SyntaxKind.ExportKeyword),
        node.asteriskToken,
        implName,
        node.typeParameters,
        node.parameters,
        node.type,
        node.body
      );

      const wrappedExport = wrapFunction(node.name.text, implName, isExported);
      return [updatedFn, ...wrappedExport];
    }

    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some(decl =>
        ts.isIdentifier(decl.name) &&
        decl.initializer &&
        (ts.isFunctionExpression(decl.initializer) || ts.isArrowFunction(decl.initializer)) &&
        !shouldSkip(decl.initializer)
      )
    ) {
      const replacements = [];

      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          (ts.isFunctionExpression(decl.initializer) || ts.isArrowFunction(decl.initializer))
        ) {
          const isExported = !!node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
          const wrapped = wrapFunction(decl.name.text, decl.initializer, isExported);
          replacements.push(...wrapped);
        } else {
          replacements.push(node);
        }
      }

      return replacements;
    }

    return node;
  }

  for (const stmt of sourceFile.statements) {
    const transformed = visit(stmt);

    if (Array.isArray(transformed)) {
      newStatements.push(...transformed);
    } else if (transformed) {
      newStatements.push(transformed);
    }
  }

  const updatedSource = factory.updateSourceFile(sourceFile, newStatements);
  return printer.printFile(updatedSource);
}
