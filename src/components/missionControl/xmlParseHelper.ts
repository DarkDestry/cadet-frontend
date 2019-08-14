import { Builder } from 'xml2js';
import {
  AssessmentCategories,
  AssessmentStatuses,
  ExternalLibraryName,
  GradingStatuses,
  IAssessment,
  IAssessmentOverview,
  IMCQQuestion,
  IProgrammingQuestion,
  IQuestion,
  ITestcase,
  Library,
  MCQChoice,
  TestcaseTypes
} from '../assessment/assessmentShape';
import {
  IXmlParseStrCProblem,
  IXmlParseStrDeployment,
  IXmlParseStrOverview,
  IXmlParseStrPProblem,
  IXmlParseStrProblem,
  IXmlParseStrProblemChoice,
  IXmlParseStrTask,
  IXmlParseStrTestcase
} from './xmlParseStrShapes';

const editingId = -1;

const capitalizeFirstLetter = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export const retrieveLocalAssessment = (): IAssessment | null => {
  const assessment = localStorage.getItem('MissionEditingAssessmentSA');
  if (assessment) {
    return JSON.parse(assessment);
  } else {
    return null;
  }
};

export const retrieveLocalAssessmentOverview = (): IAssessmentOverview | null => {
  const assessment = localStorage.getItem('MissionEditingOverviewSA');
  if (assessment) {
    return JSON.parse(assessment);
  } else {
    return null;
  }
};

export const storeLocalAssessment = (assessment: IAssessment): void => {
  localStorage.setItem('MissionEditingAssessmentSA', JSON.stringify(assessment));
};

export const storeLocalAssessmentOverview = (overview: IAssessmentOverview): void => {
  localStorage.setItem('MissionEditingOverviewSA', JSON.stringify(overview));
};

export const makeEntireAssessment = (result: any): [IAssessmentOverview, IAssessment] => {
  const assessmentArr = makeAssessment(result);
  const overview = makeAssessmentOverview(result, assessmentArr[1], assessmentArr[2]);
  return [overview, assessmentArr[0]];
};

const makeAssessmentOverview = (
  result: any,
  maxGradeVal: number,
  maxXpVal: number
): IAssessmentOverview => {
  const task: IXmlParseStrTask = result.CONTENT.TASK[0];
  const rawOverview: IXmlParseStrOverview = task.$;
  return {
    category: capitalizeFirstLetter(rawOverview.kind) as AssessmentCategories,
    closeAt: rawOverview.duedate,
    coverImage: rawOverview.coverimage,
    grade: 1,
    id: editingId,
    maxGrade: maxGradeVal,
    maxXp: maxXpVal,
    number: rawOverview.number || '',
    openAt: rawOverview.startdate,
    title: rawOverview.title,
    reading: task.READING ? task.READING[0] : '',
    shortSummary: task.WEBSUMMARY ? task.WEBSUMMARY[0] : '',
    status: AssessmentStatuses.attempting,
    story: rawOverview.story,
    xp: 0,
    gradingStatus: 'none' as GradingStatuses
  };
};

const makeAssessment = (result: any): [IAssessment, number, number] => {
  const task: IXmlParseStrTask = result.CONTENT.TASK[0];
  const rawOverview: IXmlParseStrOverview = task.$;
  const questionArr = makeQuestions(task);
  return [
    {
      category: capitalizeFirstLetter(rawOverview.kind) as AssessmentCategories,
      id: editingId,
      globalDeployment: makeLibrary(task.DEPLOYMENT),
      graderDeployment: makeLibrary(task.GRADERDEPLOYMENT),
      longSummary: task.TEXT[0],
      missionPDF: 'google.com',
      questions: questionArr[0],
      title: rawOverview.title
    },
    questionArr[1],
    questionArr[2]
  ];
};

const altEval = (str: string): any => {
  return Function('"use strict";return (' + str + ')')();
};

const makeLibrary = (deploymentArr: IXmlParseStrDeployment[] | undefined): Library => {
  if (deploymentArr === undefined) {
    return {
      chapter: -1,
      external: {
        name: 'NONE' as ExternalLibraryName,
        symbols: []
      },
      globals: []
    };
  } else {
    const deployment = deploymentArr[0];
    const external = deployment.IMPORT || deployment.EXTERNAL;
    const nameVal = external ? external[0].$.name : 'NONE';
    const symbolsVal = external ? external[0].SYMBOL || [] : [];
    const globalsVal = deployment.GLOBAL
      ? (deployment.GLOBAL.map(x => [x.IDENTIFIER[0], altEval(x.VALUE[0]), x.VALUE[0]]) as Array<
          [string, any, string]
        >)
      : [];
    return {
      chapter: parseInt(deployment.$.interpreter, 10),
      external: {
        name: nameVal as ExternalLibraryName,
        symbols: symbolsVal
      },
      globals: globalsVal
    };
  }
};

const makeQuestions = (task: IXmlParseStrTask): [IQuestion[], number, number] => {
  let maxGrade = 0;
  let maxXp = 0;
  const questions: Array<IProgrammingQuestion | IMCQQuestion> = [];
  task.PROBLEMS[0].PROBLEM.forEach((problem: IXmlParseStrProblem, curId: number) => {
    const localMaxXp = problem.$.maxxp ? parseInt(problem.$.maxxp, 10) : 0;
    const question: IQuestion = {
      answer: null,
      roomId: null,
      content: problem.TEXT[0],
      id: curId,
      library: makeLibrary(problem.DEPLOYMENT),
      graderLibrary: makeLibrary(problem.GRADERDEPLOYMENT),
      type: problem.$.type,
      grader: null,
      gradedAt: null,
      xp: 0,
      grade: 0,
      maxGrade: parseInt(problem.$.maxgrade, 10),
      maxXp: localMaxXp
    };
    maxGrade += parseInt(problem.$.maxgrade, 10);
    maxXp += localMaxXp;
    if (question.type === 'programming') {
      questions.push(makeProgramming(problem as IXmlParseStrPProblem, question));
    }
    if (question.type === 'mcq') {
      questions.push(makeMCQ(problem as IXmlParseStrCProblem, question));
    }
  });
  return [questions, maxGrade, maxXp];
};

const makeMCQ = (problem: IXmlParseStrCProblem, question: IQuestion): IMCQQuestion => {
  const choicesVal: MCQChoice[] = [];
  const solution = problem.SNIPPET ? problem.SNIPPET[0].SOLUTION : undefined;
  let solutionVal = 0;
  problem.CHOICE.forEach((choice: IXmlParseStrProblemChoice, i: number) => {
    choicesVal.push({
      content: choice.TEXT[0],
      hint: null
    });
    solutionVal = choice.$.correct === 'true' ? i : solutionVal;
  });
  return {
    ...question,
    type: 'mcq',
    answer: solution ? parseInt(solution[0], 10) : 0,
    choices: choicesVal,
    solution: solutionVal
  };
};

const makeProgramming = (
  problem: IXmlParseStrPProblem,
  question: IQuestion
): IProgrammingQuestion => {
  const testcases = problem.SNIPPET[0].TESTCASES;
  const publicTestcases = testcases ? testcases[0].PUBLIC || [] : [];
  const privateTestcases = testcases ? testcases[0].PRIVATE || [] : [];
  const prepend = problem.SNIPPET[0].PREPEND;
  const postpend = problem.SNIPPET[0].POSTPEND;
  const solution = problem.SNIPPET[0].SOLUTION;

  const result: IProgrammingQuestion = {
    ...question,
    autogradingResults: [],
    prepend: prepend ? (prepend[0] as string).trim() : '',
    solutionTemplate: problem.SNIPPET[0].TEMPLATE[0].trim() as string,
    postpend: postpend ? (postpend[0] as string).trim() : '',
    testcases: publicTestcases.map(testcase => makeTestcase(testcase)),
    testcasesPrivate: privateTestcases.map(testcase => makeTestcase(testcase)),
    answer: solution ? (solution[0] as string).trim() : '',
    type: 'programming'
  };
  if (problem.SNIPPET[0].GRADER) {
    result.graderTemplate = problem.SNIPPET[0].GRADER[0];
  }
  return result;
};

const makeTestcase = (testcase: IXmlParseStrTestcase): ITestcase => {
  return {
    type: TestcaseTypes.public,
    answer: testcase.$.answer,
    score: parseInt(testcase.$.score, 10),
    program: testcase._
  };
};

export const exportXml = () => {
  const assessmentStr = localStorage.getItem('MissionEditingAssessmentSA');
  const overviewStr = localStorage.getItem('MissionEditingOverviewSA');
  if (assessmentStr && overviewStr) {
    const assessment: IAssessment = JSON.parse(assessmentStr);
    const overview: IAssessmentOverview = JSON.parse(overviewStr);
    const filename = overview.fileName || overview.title;
    const builder = new Builder();
    const xmlTask: IXmlParseStrTask = assessmentToXml(assessment, overview);
    const xml = {
      CONTENT: {
        $: {
          'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance'
        },
        TASK: xmlTask
      }
    };
    let xmlStr = builder.buildObject(xml);
    xmlStr = xmlStr.replace(/(&#xD;)+/g, '');
    download(filename + '.xml', xmlStr);
  }
};

const download = (filename: string, text: string) => {
  const element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', filename);

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
};

const exportLibrary = (library: Library) => {
  const deployment = {
    $: {
      interpreter: library.chapter.toString()
    },
    EXTERNAL: {
      $: {
        name: library.external.name
      }
    }
  };

  if (library.external.symbols.length !== 0) {
    /* tslint:disable:no-string-literal */
    deployment.EXTERNAL['SYMBOL'] = library.external.symbols;
  }
  if (library.globals.length !== 0) {
    /* tslint:disable:no-string-literal */
    deployment['GLOBAL'] = library.globals.map(x => {
      return {
        IDENTIFIER: x[0],
        VALUE: x[2]
      };
    });
  }
  return deployment;
};

interface ITask {
  WEBSUMMARY: string[];
  TEXT: string[];
  $: IXmlParseStrOverview;
  READING: string[];
  PROBLEMS: IProblems[];
  DEPLOYMENT: any;
  GRADERDEPLOYMENT: any;
}

interface IProblems {
  PROBLEM: IProblem[];
}

type IProblem = IXmlParseStrPProblem | IXmlParseStrCProblem;

export const assessmentToXml = (
  assessment: IAssessment,
  overview: IAssessmentOverview
): IXmlParseStrTask => {
  const rawOverview: IXmlParseStrOverview = {
    coverimage: overview.coverImage,
    duedate: overview.closeAt,
    kind: overview.category.toLowerCase(),
    number: overview.number || '',
    startdate: overview.openAt,
    story: overview.story,
    title: overview.title
  };
  const task: ITask = {
    PROBLEMS: [{ PROBLEM: assessment.questions.map(makeQuestion) }],
    $: rawOverview,
    WEBSUMMARY: [overview.shortSummary],
    TEXT: [assessment.longSummary],
    DEPLOYMENT: exportLibrary(assessment.globalDeployment!),
    GRADERDEPLOYMENT:
      assessment.graderDeployment!.chapter !== -1
        ? exportLibrary(assessment.graderDeployment!)
        : [],
    READING: overview.reading ? [overview.reading] : []
  };

  function makeCodingQuestion(question: IProgrammingQuestion): IXmlParseStrPProblem {
    // tslint:disable-next-line: no-shadowed-variable
    function makeSnippet(question: IProgrammingQuestion) {
      const TESTCASES: {
        PUBLIC?: IXmlParseStrTestcase[];
        PRIVATE?: IXmlParseStrTestcase[];
      } = {};
      if (question.testcases.length || question.testcasesPrivate!.length) {
        if (question.testcases.length) {
          TESTCASES.PUBLIC = question.testcases.map(testcase => {
            return {
              $: {
                answer: testcase.answer,
                score: String(testcase.score)
              },
              _: testcase.program
            };
          });
        }

        if (question.testcasesPrivate && question.testcasesPrivate.length) {
          TESTCASES.PRIVATE = question.testcasesPrivate.map(testcase => {
            return {
              $: {
                answer: testcase.answer,
                score: String(testcase.score)
              },
              _: testcase.program
            };
          });
        }
      }

      return {
        SOLUTION: [question.answer || ''],
        TEMPLATE: [question.solutionTemplate],
        PREPEND: question.prepend,
        POSTPEND: question.postpend,
        GRADER: question.graderTemplate ? [question.graderTemplate] : [],
        TESTCASES: [TESTCASES]
      };
    }

    const problem: IXmlParseStrPProblem = {
      $: {
        type: question.type,
        maxgrade: String(question.maxGrade),
        maxxp: String(question.maxXp || 0)
      },
      SNIPPET: [makeSnippet(question)],
      TEXT: [question.content]
    };

    // TODO: check if this needs fixing.
    if (question.library.chapter !== -1) {
      problem.$['DEPLOYMENT'] = question.library.chapter;
    }

    if (question.graderLibrary!.chapter !== -1) {
      problem.$['GRADERDEPLOYMENT'] = question.graderLibrary!.chapter;
    }

    return problem;
  }

  function makeMCQQuestion(question: IMCQQuestion): IXmlParseStrCProblem {
    const problem: IXmlParseStrCProblem = {
      $: {
        type: question.type,
        maxgrade: String(question.maxGrade),
        maxxp: String(question.maxXp || 0)
      },
      SNIPPET: {
        SOLUTION: [String(question.solution)]
      },
      TEXT: [question.content],
      CHOICE: question.choices.map((choice: MCQChoice, i: number) => ({
        $: {
          correct: question.solution === i ? 'true' : 'false'
        },
        TEXT: [choice.content]
      }))
    };
    return problem;
  }

  function makeQuestion(question: IProgrammingQuestion | IMCQQuestion): IProblem {
    if (question.type === 'programming') {
      return makeCodingQuestion(question);
    } else {
      return makeMCQQuestion(question);
    }
  }

  return task; // This is how borked i think the system is.
};
