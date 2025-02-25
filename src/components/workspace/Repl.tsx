import { Card, Classes, Pre } from '@blueprintjs/core';
import * as classNames from 'classnames';
import { parseError } from 'js-slang';
import { stringify } from 'js-slang/dist/interop';
import * as React from 'react';
import { HotKeys } from 'react-hotkeys';

import { InterpreterOutput } from '../../reducers/states';
import CanvasOutput from './CanvasOutput';
import ReplInput, { IReplInputProps } from './ReplInput';

export interface IReplProps {
  output: InterpreterOutput[];
  replValue: string;
  handleBrowseHistoryDown: () => void;
  handleBrowseHistoryUp: () => void;
  handleReplEval: () => void;
  handleReplValueChange: (newCode: string) => void;
}

export interface IOutputProps {
  output: InterpreterOutput;
}

class Repl extends React.PureComponent<IReplProps, {}> {
  public render() {
    const cards = this.props.output.map((slice, index) => <Output output={slice} key={index} />);
    const inputProps: IReplInputProps = this.props as IReplInputProps;
    return (
      <div className="Repl">
        <div className="repl-output-parent">
          {cards}
          <HotKeys
            className={classNames('repl-input-parent', 'row', Classes.CARD, Classes.ELEVATION_0)}
            handlers={handlers}
          >
            <ReplInput {...inputProps} />
          </HotKeys>
        </div>
      </div>
    );
  }
}

export const Output: React.SFC<IOutputProps> = props => {
  switch (props.output.type) {
    case 'code':
      return (
        <Card>
          <Pre className="codeOutput">{props.output.value}</Pre>
        </Card>
      );
    case 'running':
      return (
        <Card>
          <Pre className="logOutput">{props.output.consoleLogs.join('\n')}</Pre>
        </Card>
      );
    case 'result':
      if (props.output.consoleLogs.length === 0) {
        return (
          <Card>
            <Pre className="resultOutput">{renderResult(props.output.value)}</Pre>
          </Card>
        );
      } else {
        return (
          <Card>
            <Pre className="logOutput">{props.output.consoleLogs.join('\n')}</Pre>
            <Pre className="resultOutput">{renderResult(props.output.value)}</Pre>
          </Card>
        );
      }
    case 'errors':
      if (props.output.consoleLogs.length === 0) {
        return (
          <Card>
            <Pre className="errorOutput">{parseError(props.output.errors)}</Pre>
          </Card>
        );
      } else {
        return (
          <Card>
            <Pre className="logOutput">{props.output.consoleLogs.join('\n')}</Pre>
            <br />
            <Pre className="errorOutput">{parseError(props.output.errors)}</Pre>
          </Card>
        );
      }
    default:
      return <Card>''</Card>;
  }
};

const renderResult = (value: any) => {
  /** A class which is the output of the show() function */
  const ShapeDrawn = (window as any).ShapeDrawn;
  if (typeof ShapeDrawn !== 'undefined' && value instanceof ShapeDrawn) {
    return <CanvasOutput canvas={value.$canvas} />;
  } else {
    return stringify(value);
  }
};

/* Override handler, so does not trigger when focus is in editor */
const handlers = {
  goGreen: () => {}
};

export default Repl;
