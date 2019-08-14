import { omit } from 'lodash';
import { parseString } from 'xml2js';
import {
  AssessmentCategories,
  AssessmentStatuses,
  IAssessment,
  IAssessmentOverview
} from '../../assessment/assessmentShape';
import { generateXmlString, makeEntireAssessment } from '../xmlParseHelper';
function parseXml(content: string) {
  return new Promise( (resolve, reject) => {
    parseString(content, (err: any, result: any) => {
      if(err){
        return reject(err);
      }
      return resolve(result);
    });
  });
}

function stripAssessment(assessment: IAssessment) {
  return omit(assessment, ['id']);
}

test.only('I/O on almost empty assignment', async () => {
  const title = 'A sample guided path';
  const assessment: IAssessment =   {
    category: AssessmentCategories.Path,
    id: 6,
    longSummary: `This is a sample assessment`,
    missionPDF: 'www.xxx.google.com',
    questions: [],
    title,
  };
  const overview: IAssessmentOverview = {
    category: AssessmentCategories.Path,
    closeAt: '2048-06-18T05:24:26.026Z',
    coverImage: 'https://fakeimg.pl/300/',
    grade: 1,
    id: 1,
    maxGrade: 3000,
    maxXp: 1000,
    openAt: '2038-06-18T05:24:26.026Z',
    title,
    shortSummary:
      'This is a test for the UI of the unopened assessment overview. It links to the mock Mission 0',
    status: AssessmentStatuses.not_attempted,
    story: 'mission-1',
    xp: 0,
    gradingStatus: 'none'
  };

  const xmlStr = generateXmlString(assessment, overview);
  const parsed = await parseXml(xmlStr);
  const entireAssessment: [IAssessmentOverview, IAssessment] = makeEntireAssessment(parsed);
  const [newOverview, newAssessment] = entireAssessment;
  expect(stripAssessment(newAssessment)).toEqual(stripAssessment(assessment));
  expect(newOverview).toEqual(overview);
});
