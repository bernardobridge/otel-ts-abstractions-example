import * as ts from 'typescript';

export default function traceAllFunctions(): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    const factory = context.factory;

    return (sourceFile) => {
      const file = sourceFile.fileName;

      // 🚫 Skip all files inside a 'telemetry/' folder
      if (file.includes('/telemetry/') || file.includes('\\telemetry\\')) {
        return sourceFile;
      }

      const moduleName = file.split(/[\\/]/).pop()?.replace(/\.[tj]s$/, '') || 'module';
      const newStatements: ts.Statement[] = [];
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

      function shouldSkip(node: ts.Node): boolean {
        const comments = ts.getLeadingCommentRanges(sourceFile.getFullText(), node.getFullStart());
        if (!comments) return false;
        return comments.some(c => sourceFile.getFullText().slice(c.pos, c.end).includes('no-trace'));
      }

      function wrapFunction(name: string, implExpr: ts.Expression, isExported: boolean): ts.Statement[] {
        injectWrapFnImport();
      
        const statements: ts.Statement[] = [];
      
        // Only create implDecl if this is NOT already an identifier (i.e. we haven't already declared it)
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

      function visit(node: ts.Node): ts.VisitResult<ts.Node> {
        // function foo() {}
        if (ts.isFunctionDeclaration(node) && node.name && !shouldSkip(node)) {
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

        // const foo = () => {}
        if (
          ts.isVariableStatement(node) &&
          node.declarationList.declarations.some(decl =>
            ts.isIdentifier(decl.name) &&
            decl.initializer &&
            (ts.isFunctionExpression(decl.initializer) || ts.isArrowFunction(decl.initializer)) &&
            !shouldSkip(decl.initializer)
          )
        ) {
          const replacements: ts.Statement[] = [];

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

        return ts.visitEachChild(node, visit, context);
      }

      for (const stmt of sourceFile.statements) {
        const transformed = visit(stmt);

        if (Array.isArray(transformed)) {
          newStatements.push(...(transformed as ts.Statement[]));
        } else if (transformed) {
          newStatements.push(transformed as ts.Statement);
        }
      }

      return factory.updateSourceFile(sourceFile, newStatements);
    };
  };
}
