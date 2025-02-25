import { Context, interrupt, resume, runInContext, setBreakpointAtLine } from 'js-slang';
import { InterruptedError } from 'js-slang/dist/interpreter-errors';
import { manualToggleDebugger } from 'js-slang/dist/stdlib/inspector';
import { SourceError } from 'js-slang/dist/types';
import { cloneDeep } from 'lodash';
import { SagaIterator } from 'redux-saga';
import { call, delay, put, race, select, take, takeEvery } from 'redux-saga/effects';

import * as actions from '../actions';
import * as actionTypes from '../actions/actionTypes';
import { WorkspaceLocation, WorkspaceLocations } from '../actions/workspaces';
import { ExternalLibraryNames, ITestcase } from '../components/assessment/assessmentShape';
import { externalLibraries } from '../reducers/externalLibraries';
import { IState, IWorkspaceState, SideContentType } from '../reducers/states';
import { showSuccessMessage, showWarningMessage } from '../utils/notification';
import { highlightLine, inspectorUpdate, visualiseEnv } from '../utils/slangHelper';

export default function* workspaceSaga(): SagaIterator {
  let context: Context;

  yield takeEvery(actionTypes.EVAL_EDITOR, function*(
    action: ReturnType<typeof actions.evalEditor>
  ) {
    const workspaceLocation = action.payload.workspaceLocation;
    const code: string = yield select((state: IState) => {
      const prepend = (state.workspaces[workspaceLocation] as IWorkspaceState).editorPrepend;
      const value = (state.workspaces[workspaceLocation] as IWorkspaceState).editorValue!;
      const postpend = (state.workspaces[workspaceLocation] as IWorkspaceState).editorPostpend;

      return prepend + (prepend.length > 0 ? '\n' : '') + value + '\n' + postpend;
    });
    const chapter: number = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).context.chapter
    );
    const execTime: number = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).execTime
    );
    const symbols: string[] = yield select(
      (state: IState) =>
        (state.workspaces[workspaceLocation] as IWorkspaceState).context.externalSymbols
    );
    const globals: Array<[string, any]> = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).globals
    );
    const library = {
      chapter,
      external: {
        name: ExternalLibraryNames.NONE,
        symbols
      },
      globals
    };
    /** End any code that is running right now. */
    yield put(actions.beginInterruptExecution(workspaceLocation));
    /** Clear the context, with the same chapter and externalSymbols as before. */
    yield put(actions.beginClearContext(library, workspaceLocation));
    yield put(actions.clearReplOutput(workspaceLocation));
    context = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).context
    );
    yield* evalCode(code, context, execTime, workspaceLocation, actionTypes.EVAL_EDITOR);
  });

  yield takeEvery(actionTypes.TOGGLE_EDITOR_AUTORUN, function*(
    action: ReturnType<typeof actions.toggleEditorAutorun>
  ) {
    const workspaceLocation = action.payload.workspaceLocation;
    const isEditorAutorun = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).isEditorAutorun
    );
    yield call(showWarningMessage, 'Autorun ' + (isEditorAutorun ? 'Started' : 'Stopped'), 750);
  });

  yield takeEvery(actionTypes.INVALID_EDITOR_SESSION_ID, function*(
    action: ReturnType<typeof actions.invalidEditorSessionId>
  ) {
    yield call(showWarningMessage, 'Invalid ID Input', 1000);
  });

  yield takeEvery(actionTypes.EVAL_REPL, function*(action: ReturnType<typeof actions.evalRepl>) {
    const workspaceLocation = action.payload.workspaceLocation;
    const code: string = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).replValue
    );
    const execTime: number = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).execTime
    );
    yield put(actions.beginInterruptExecution(workspaceLocation));
    yield put(actions.clearReplInput(workspaceLocation));
    yield put(actions.sendReplInputToOutput(code, workspaceLocation));
    context = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).context
    );
    yield* evalCode(code, context, execTime, workspaceLocation, actionTypes.EVAL_REPL);
  });

  yield takeEvery(actionTypes.DEBUG_RESUME, function*(
    action: ReturnType<typeof actions.debuggerResume>
  ) {
    const workspaceLocation = action.payload.workspaceLocation;
    const code: string = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).editorValue
    );
    const execTime: number = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).execTime
    );
    yield put(actions.beginInterruptExecution(workspaceLocation));
    /** Clear the context, with the same chapter and externalSymbols as before. */
    yield put(actions.clearReplOutput(workspaceLocation));
    context = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).context
    );
    yield put(actions.highlightEditorLine([], workspaceLocation));
    yield* evalCode(code, context, execTime, workspaceLocation, actionTypes.DEBUG_RESUME);
  });

  yield takeEvery(actionTypes.DEBUG_RESET, function*(
    action: ReturnType<typeof actions.debuggerReset>
  ) {
    const workspaceLocation = action.payload.workspaceLocation;
    context = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).context
    );
    inspectorUpdate(undefined);
    highlightLine([0]);
    yield put(actions.clearReplOutput(workspaceLocation));
    context.runtime.break = false;
    lastDebuggerResult = undefined;
  });

  yield takeEvery(actionTypes.HIGHLIGHT_LINE, function*(
    action: ReturnType<typeof actions.highlightEditorLine>
  ) {
    const workspaceLocation = action.payload.highlightedLines;
    highlightLine(workspaceLocation);
    yield;
  });

  yield takeEvery(actionTypes.UPDATE_EDITOR_BREAKPOINTS, function*(
    action: ReturnType<typeof actions.setEditorBreakpoint>
  ) {
    setBreakpointAtLine(action.payload.breakpoints);
    yield;
  });

  yield takeEvery(actionTypes.EVAL_TESTCASE, function*(
    action: ReturnType<typeof actions.evalTestcase>
  ) {
    const workspaceLocation = action.payload.workspaceLocation;
    const index = action.payload.testcaseId;
    const code: string = yield select((state: IState) => {
      const prepend = (state.workspaces[workspaceLocation] as IWorkspaceState).editorPrepend;
      const value = (state.workspaces[workspaceLocation] as IWorkspaceState).editorValue!;
      const postpend = (state.workspaces[workspaceLocation] as IWorkspaceState).editorPostpend;
      const testcase = (state.workspaces[workspaceLocation] as IWorkspaceState).editorTestcases[
        index
      ].program;

      return (
        prepend +
        (prepend.length > 0 ? '\n' : '') +
        value +
        '\n' +
        postpend +
        (postpend.length > 0 ? '\n' : '') +
        testcase
      );
    });
    const execTime: number = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).execTime
    );
    const chapter: number = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).context.chapter
    );
    const symbols: string[] = yield select(
      (state: IState) =>
        (state.workspaces[workspaceLocation] as IWorkspaceState).context.externalSymbols
    );
    const globals: Array<[string, any]> = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).globals
    );
    const library = {
      chapter,
      external: {
        name: ExternalLibraryNames.NONE,
        symbols
      },
      globals
    };
    /** Do not interrupt execution of other testcases (potential race condition). */
    /** Clear the context, with the same chapter and externalSymbols as before. */
    yield put(actions.beginClearContext(library, workspaceLocation));
    /** Do NOT clear the REPL output! */
    context = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).context
    );
    yield* evalTestCode(code, context, execTime, workspaceLocation, index);
  });

  yield takeEvery(actionTypes.CHAPTER_SELECT, function*(
    action: ReturnType<typeof actions.chapterSelect>
  ) {
    const workspaceLocation = action.payload.workspaceLocation;
    const newChapter = action.payload.chapter;
    const oldChapter = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).context.chapter
    );
    const symbols: string[] = yield select(
      (state: IState) =>
        (state.workspaces[workspaceLocation] as IWorkspaceState).context.externalSymbols
    );
    const globals: Array<[string, any]> = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).globals
    );
    if (newChapter !== oldChapter) {
      const library = {
        chapter: newChapter,
        external: {
          name: ExternalLibraryNames.NONE,
          symbols
        },
        globals
      };
      yield put(actions.beginClearContext(library, workspaceLocation));
      yield put(actions.clearReplOutput(workspaceLocation));
      yield call(showSuccessMessage, `Switched to Source \xa7${newChapter}`, 1000);
    }
  });

  /**
   * Note that the PLAYGROUND_EXTERNAL_SELECT action is made to
   * select the library for playground.
   * This is because assessments do not have a chapter & library select, the question
   * specifies the chapter and library to be used.
   *
   * To abstract this to assessments, the state structure must be manipulated to store
   * the external library name in a IWorkspaceState (as compared to IWorkspaceManagerState).
   *
   * @see IWorkspaceManagerState @see IWorkspaceState
   */
  yield takeEvery(actionTypes.PLAYGROUND_EXTERNAL_SELECT, function*(
    action: ReturnType<typeof actions.externalLibrarySelect>
  ) {
    const workspaceLocation = action.payload.workspaceLocation;
    const chapter = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).context.chapter
    );
    const globals: Array<[string, any]> = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).globals
    );
    const newExternalLibraryName = action.payload.externalLibraryName;
    const oldExternalLibraryName = yield select(
      (state: IState) => state.workspaces[workspaceLocation].externalLibrary
    );
    const symbols = externalLibraries.get(newExternalLibraryName)!;
    const library = {
      chapter,
      external: {
        name: newExternalLibraryName,
        symbols
      },
      globals
    };
    if (newExternalLibraryName !== oldExternalLibraryName) {
      yield put(actions.changeExternalLibrary(newExternalLibraryName, workspaceLocation));
      yield put(actions.beginClearContext(library, workspaceLocation));
      yield put(actions.clearReplOutput(workspaceLocation));
      yield call(showSuccessMessage, `Switched to ${newExternalLibraryName} library`, 1000);
    }
  });

  /**
   * Ensures that the external JS libraries have been loaded by waiting
   * with a timeout. An error message will be shown
   * if the libraries are not loaded. This is particularly useful
   * when dealing with external library pre-conditions, e.g when the
   * website has just loaded and there is a need to reset the js-slang context,
   * but it cannot be determined if the global JS files are loaded yet.
   *
   * The presence of JS libraries are checked using the presence of a global
   * function "getReadyWebGLForCanvas", that is used in CLEAR_CONTEXT to prepare
   * the canvas for rendering in a specific mode.
   *
   * @see webGLgraphics.js under 'public/externalLibs/graphics' for information on
   * the function.
   *
   * @returns true if the libraries are loaded before timeout
   * @returns false if the loading of the libraries times out
   */
  function* checkWebGLAvailable() {
    function* helper() {
      while (true) {
        if ((window as any).getReadyWebGLForCanvas !== undefined) {
          break;
        }
        yield delay(250);
      }
      return true;
    }
    /** Create a race condition between the js files being loaded and a timeout. */
    const { loadedScripts, timeout } = yield race({
      loadedScripts: call(helper),
      timeout: delay(4000)
    });
    if (timeout !== undefined && loadedScripts === undefined) {
      yield call(showWarningMessage, 'Error loading libraries', 750);
      return false;
    } else {
      return true;
    }
  }

  /**
   * Makes a call to checkWebGLAvailable to ensure that the Graphics libraries are loaded.
   * To abstract this to other libraries, add a call to the all() effect.
   */
  yield takeEvery(actionTypes.ENSURE_LIBRARIES_LOADED, function*(
    action: ReturnType<typeof actions.ensureLibrariesLoaded>
  ) {
    yield* checkWebGLAvailable();
  });

  /**
   * Handles the side effect of resetting the WebGL context when context is reset.
   *
   * @see webGLgraphics.js under 'public/externalLibs/graphics' for information on
   * the function.
   */
  yield takeEvery(actionTypes.BEGIN_CLEAR_CONTEXT, function*(
    action: ReturnType<typeof actions.beginClearContext>
  ) {
    yield* checkWebGLAvailable();
    const externalLibraryName = action.payload.library.external.name;
    switch (externalLibraryName) {
      case ExternalLibraryNames.RUNES:
        (window as any).loadLib('RUNES');
        (window as any).getReadyWebGLForCanvas('3d');
        break;
      case ExternalLibraryNames.CURVES:
        (window as any).loadLib('CURVES');
        (window as any).getReadyWebGLForCanvas('curve');
        break;
    }
    const globals: Array<[string, any]> = action.payload.library.globals as Array<[string, any]>;
    for (const [key, value] of globals) {
      window[key] = value;
    }
    yield put(actions.endClearContext(action.payload.library, action.payload.workspaceLocation));
    yield undefined;
  });
}

let lastDebuggerResult: any;
function* updateInspector(workspaceLocation: WorkspaceLocation) {
  try {
    const start = lastDebuggerResult.context.runtime.nodes[0].loc.start.line - 1;
    const end = lastDebuggerResult.context.runtime.nodes[0].loc.end.line - 1;
    yield put(actions.highlightEditorLine([start, end], workspaceLocation));
    inspectorUpdate(lastDebuggerResult);
    visualiseEnv(lastDebuggerResult);
  } catch (e) {
    put(actions.highlightEditorLine([], workspaceLocation));
    // most likely harmless, we can pretty much ignore this.
    // half of the time this comes from execution ending or a stack overflow and
    // the context goes missing.
  }
}

export function* evalCode(
  code: string,
  context: Context,
  execTime: number,
  workspaceLocation: WorkspaceLocation,
  actionType: string
) {
  context.runtime.debuggerOn =
    (actionType === actionTypes.EVAL_EDITOR || actionType === actionTypes.DEBUG_RESUME) &&
    context.chapter > 2;
  if (!context.runtime.debuggerOn && context.chapter > 2) {
    inspectorUpdate(undefined); // effectively resets the interface
  }
  const { result, interrupted, paused } = yield race({
    result:
      actionType === actionTypes.DEBUG_RESUME
        ? call(resume, lastDebuggerResult)
        : call(runInContext, code, context, {
            scheduler: 'preemptive',
            originalMaxExecTime: execTime
          }),
    /**
     * A BEGIN_INTERRUPT_EXECUTION signals the beginning of an interruption,
     * i.e the trigger for the interpreter to interrupt execution.
     */
    interrupted: take(actionTypes.BEGIN_INTERRUPT_EXECUTION),
    paused: take(actionTypes.BEGIN_DEBUG_PAUSE)
  });

  if (interrupted) {
    interrupt(context);
    /* Redundancy, added ensure that interruption results in an error. */
    context.errors.push(new InterruptedError(context.runtime.nodes[0]));
    yield put(actions.debuggerReset(workspaceLocation));
    yield put(actions.endInterruptExecution(workspaceLocation));
    yield call(showWarningMessage, 'Execution aborted', 750);
    return;
  }

  if (paused) {
    yield put(actions.endDebuggerPause(workspaceLocation));
    lastDebuggerResult = manualToggleDebugger(context);
    yield updateInspector(workspaceLocation);
    yield call(showWarningMessage, 'Execution paused', 750);
    return;
  }

  if (actionType === actionTypes.EVAL_EDITOR) {
    lastDebuggerResult = result;
  }
  yield updateInspector(workspaceLocation);

  if (result.status !== 'suspended' && result.status !== 'finished') {
    const prepend = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).editorPrepend
    );
    const prependLines = prepend.length > 0 ? prepend.split('\n').length : 0;

    const errors = context.errors.map((error: SourceError) => {
      const newError = cloneDeep(error);
      newError.location.start.line = newError.location.start.line - prependLines;
      newError.location.end.line = newError.location.end.line - prependLines;
      return newError;
    });

    yield put(actions.evalInterpreterError(errors, workspaceLocation));
    return;
  } else if (result.status === 'suspended') {
    yield put(actions.endDebuggerPause(workspaceLocation));
    yield put(actions.evalInterpreterSuccess('Breakpoint hit!', workspaceLocation));
    return;
  }

  yield put(actions.evalInterpreterSuccess(result.value, workspaceLocation));

  /** If successful, then continue to run all testcases IFF evalCode was triggered from
   *    EVAL_EDITOR (Run button) instead of EVAL_REPL (Eval button)
   * Retrieve the index of the active side-content tab
   */
  if (actionType === actionTypes.EVAL_EDITOR) {
    const activeTab: SideContentType = yield select(
      (state: IState) =>
        (state.workspaces[workspaceLocation] as IWorkspaceState).sideContentActiveTab
    );
    /** If a student is attempting an assessment and has the autograder tab open OR
     *    a grader is grading a submission and has the autograder tab open,
     *    RUN all testcases of the current question through the interpreter
     *  Each testcase runs in its own "sandbox" since the Context is cleared for each,
     *    so side-effects from one testcase don't affect others
     */
    if (
      activeTab === SideContentType.autograder &&
      (workspaceLocation === WorkspaceLocations.assessment ||
        workspaceLocation === WorkspaceLocations.grading)
    ) {
      const testcases: ITestcase[] = yield select(
        (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).editorTestcases
      );
      /** Avoid displaying message if there are no testcases */
      if (testcases.length > 0) {
        /** Display a message to the user */
        yield call(showSuccessMessage, `Running all testcases!`, 750);
        for (const idx of testcases.keys()) {
          yield put(actions.evalTestcase(workspaceLocation, idx));
          /** Run testcases synchronously
           * This blocks the generator until result of current testcase is known and output to REPL
           * Ensures that HANDLE_CONSOLE_LOG appends consoleLogs (from display(...) calls) to the
           * correct testcase result
           */
          yield take([actionTypes.EVAL_TESTCASE_SUCCESS, actionTypes.EVAL_TESTCASE_FAILURE]);
        }
      }
    }
  }
}

export function* evalTestCode(
  code: string,
  context: Context,
  execTime: number,
  workspaceLocation: WorkspaceLocation,
  index: number
) {
  yield put(actions.resetTestcase(workspaceLocation, index));

  const { result, interrupted } = yield race({
    result: call(runInContext, code, context, {
      scheduler: 'preemptive',
      originalMaxExecTime: execTime
    }),
    /**
     * A BEGIN_INTERRUPT_EXECUTION signals the beginning of an interruption,
     * i.e the trigger for the interpreter to interrupt execution.
     */
    interrupted: take(actionTypes.BEGIN_INTERRUPT_EXECUTION)
  });

  if (interrupted) {
    interrupt(context);
    /* Redundancy, added ensure that interruption results in an error. */
    context.errors.push(new InterruptedError(context.runtime.nodes[0]));
    yield put(actions.endInterruptExecution(workspaceLocation));
    yield call(showWarningMessage, `Execution of testcase ${index} aborted`, 750);
    return;
  }

  if (result.status !== 'finished') {
    const prepend = yield select(
      (state: IState) => (state.workspaces[workspaceLocation] as IWorkspaceState).editorPrepend
    );
    const prependLines = prepend.length > 0 ? prepend.split('\n').length : 0;

    const errors = context.errors.map((error: SourceError) => {
      const newError = cloneDeep(error);
      newError.location.start.line = newError.location.start.line - prependLines;
      newError.location.end.line = newError.location.end.line - prependLines;
      return newError;
    });

    yield put(actions.evalInterpreterError(errors, workspaceLocation));
    yield put(actions.evalTestcaseFailure(errors, workspaceLocation, index));
    return;
  }

  yield put(actions.evalInterpreterSuccess(result.value, workspaceLocation));
  yield put(actions.evalTestcaseSuccess(result.value, workspaceLocation, index));
}
