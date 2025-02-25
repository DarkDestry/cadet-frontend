/* tslint:disable: ban-types*/
import createSlangContext from 'js-slang/dist/createContext';
import { stringify } from 'js-slang/dist/interop';
import { Context, Value } from 'js-slang/dist/types';
import { handleConsoleLog } from '../actions';

/**
 * This file contains wrappers for certain functions
 * in the @source-academy/slang module.
 *
 * Use this file especially when attempting to create a slang Context.
 */

/**
 * Function that takes a value and displays it in the interpreter.
 * It uses the js-slang stringify to convert values into a "nicer"
 * output. e.g. [1, 2, 3] displays as [1, 2, 3].
 * An action is dispatched using the redux store reference
 * within the global window object.
 *
 * @param value the value to be displayed
 * @param workspaceLocation used to determine
 *   which REPL the value shows up in.
 */
function display(value: Value, str: string, workspaceLocation: any) {
  display((str === undefined ? '' : str + ' ') + stringify(value), '', workspaceLocation);
  return value;
}

/**
 * Function that takes a value and displays it in the interpreter.
 * The value is displayed however native JS would convert it to a string.
 * e.g. [1, 2, 3] would be displayed as 1,2,3.
 * An action is dispatched using the redux store reference
 * within the global window object.
 *
 * @param value the value to be displayed
 * @param workspaceLocation used to determine
 *   which REPL the value shows up in.
 */
function rawDisplay(value: Value, str: string, workspaceLocation: any) {
  const output = (str === undefined ? '' : str + ' ') + String(value);
  // TODO in 2019: fix this hack
  if (typeof (window as any).__REDUX_STORE__ !== 'undefined') {
    (window as any).__REDUX_STORE__.dispatch(handleConsoleLog(output, workspaceLocation));
  }
  return value;
}

/**
 * A function to prompt the user using a popup.
 * The function is not called 'prompt' to prevent shadowing.
 *
 * @param value the value to be displayed as a prompt
 */
function cadetPrompt(value: any) {
  return prompt(value);
}

/**
 * A function to alert the user using the browser's alert()
 * function.
 *
 * @param value the value to alert the user with
 */
function cadetAlert(value: any) {
  alert(stringify(value));
}

/**
 * A dummy function to pass into createContext.
 * An actual implementation will have to be added
 * with the list visualiser implementation. See #187
 *
 * @param list the list to be visualised.
 */
function visualiseList(list: any) {
  if ((window as any).ListVisualizer) {
    (window as any).ListVisualizer.draw(list);
    return list;
  } else {
    throw new Error('List visualizer is not enabled');
  }
}

export function visualiseEnv(context: Context) {
  if ((window as any).EnvVisualizer) {
    (window as any).EnvVisualizer.draw_env({ context });
  } else {
    throw new Error('Env visualizer is not enabled');
  }
}

export function highlightLine(line: number[]) {
  if ((window as any).Inspector) {
    (window as any).Inspector.highlightClean();
    (window as any).Inspector.highlightLine(line[0]);
  } else {
    throw new Error('Inspector not loaded');
  }
}

export function inspectorUpdate(context: Context | undefined) {
  if ((window as any).Inspector) {
    (window as any).Inspector.updateContext(context, stringify);
  } else {
    throw new Error('Inspector not loaded');
  }
}

/**
 * A wrapper around js-slang's createContext. This
 * provides the original function with the required
 * externalBuiltIns, such as display and prompt.
 */
export function createContext<T>(chapter: number, externals: string[], externalContext: T) {
  const externalBuiltIns = {
    display,
    rawDisplay,
    prompt: cadetPrompt,
    alert: cadetAlert,
    visualiseList
  };
  return createSlangContext<T>(chapter, externals, externalContext, externalBuiltIns);
}
