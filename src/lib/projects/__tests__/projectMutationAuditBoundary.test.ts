import { readFileSync } from 'node:fs';
import { describe,it,expect,vi } from 'vitest';
import ts from 'typescript';
// Execute actual callback expressions from affected UI files with React Query's
// second argument. It must never become the service's optional performedBy.
const paths=[
 ['src/components/project/JobsListPanel.tsx','deleteJob'],
 ['src/components/project/LargeProjectsListPanel.tsx','deleteLargeProject'],
 ['src/components/project/MediumProjectsListPanel.tsx','deleteProject'],
 ['src/components/project/UnifiedProjectList.tsx','cancelJob'],
 ['src/components/project/UnifiedProjectList.tsx','cancelProject'],
 ['src/components/project/UnifiedProjectList.tsx','deleteLargeProject'],
 ['src/pages/ProjectManagement.tsx','deleteProject'],
];
describe('React Query audit actor boundary',()=>{
 it.each(paths)('%s only passes id to %s',(path,serviceName)=>{
  const source=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let callback:ts.Expression|undefined;
  function visit(node:ts.Node){
   if(ts.isPropertyAssignment(node)&&node.name.getText(source)==='mutationFn'&&node.initializer.getText(source).includes(serviceName)) callback=node.initializer;
   ts.forEachChild(node,visit);
  }
  visit(source);expect(callback).toBeDefined();
  const code=ts.transpile(`const callback=${callback!.getText(source)};`,{target:ts.ScriptTarget.ES2022});
  const service=vi.fn();const fn=new Function(serviceName,`${code}; return callback;`)(service);
  fn('project-123',{client:{},mutationKey:['delete']});
  expect(service.mock.calls).toEqual([['project-123']]);
 });
});
