import { Card, Classes, Divider, Pre, Slider } from '@blueprintjs/core';
import { IconNames } from '@blueprintjs/icons';
import * as React from 'react';
import { HotKeys } from 'react-hotkeys';

import { controlButton } from '../../commons';

export interface ISubstVisualizerProps {
  content: string[];
}

export interface ISubstVisualizerState {
  value: number;
}

const SubstDefaultText = () => {
  return (
    <div>
      <div id="substituter-default-text" className={Classes.RUNNING_TEXT}>
        Welcome to the Substituter!
        <br />
        <br />
        On this tab, the REPL will be hidden from view. You may use this tool by writing some code
        on the left, then dragging the slider above to see its evaluation.
        <br />
        <br />
        Alternatively, you may click on the gutter of the editor (where all the line numbers are, on
        the left) to set a breakpoint, and then run the program to show it here!
        <br />
        <br />
        <Divider />
        Some useful keyboard shortcuts:
        <br />
        {controlButton('Shift', IconNames.KEY_SHIFT)}+ {controlButton('Left', IconNames.ARROW_LEFT)}
        : Move to the previous step
        <br />
        {controlButton('Shift', IconNames.KEY_SHIFT)}+{' '}
        {controlButton('Right', IconNames.ARROW_RIGHT)}: Move to the next step
        <br />
        {controlButton('Shift', IconNames.KEY_SHIFT)}+ {controlButton('Up', IconNames.ARROW_UP)}:
        Move to the first step
        <br />
        {controlButton('Shift', IconNames.KEY_SHIFT)}+ {controlButton('Down', IconNames.ARROW_DOWN)}
        : Move to the last step
        <br />
        <br />
        Note that these shortcuts are only active when the browser focus is on this panel (click on
        the slider or the text!).
      </div>
    </div>
  );
};

const SubstCodeDisplay = (props: { content: string }) => {
  return (
    <Card>
      <Pre className="resultOutput">{props.content}</Pre>
    </Card>
  );
};

const substKeyMap = {
  PREV_STEP: 'shift+left',
  NEXT_STEP: 'shift+right',
  FIRST_STEP: 'shift+up',
  LAST_STEP: 'shift+down'
};

class SubstVisualizer extends React.Component<ISubstVisualizerProps, ISubstVisualizerState> {
  constructor(props: ISubstVisualizerProps) {
    super(props);
    this.state = {
      value: 1
    };
  }

  public render() {
    const lastStepValue = this.props.content.length;
    // 'content' property is initialised to '[]' by Playground component
    const hasRunCode = lastStepValue !== 0;
    const substHandlers = hasRunCode
      ? {
          PREV_STEP: this.stepPrev,
          NEXT_STEP: this.stepNext(lastStepValue),
          FIRST_STEP: this.stepFirst,
          LAST_STEP: this.stepLast(lastStepValue)
        }
      : {
          PREV_STEP: () => {},
          NEXT_STEP: () => {},
          FIRST_STEP: () => {},
          LAST_STEP: () => {}
        };

    return (
      <HotKeys keyMap={substKeyMap} handlers={substHandlers}>
        <div>
          <div className="sa-substituter">
            <Slider
              disabled={!hasRunCode}
              min={1}
              max={this.props.content.length}
              onChange={this.sliderShift}
              value={this.state.value <= lastStepValue ? this.state.value : 1}
            />
            {hasRunCode ? (
              <SubstCodeDisplay content={this.props.content[this.state.value - 1]} />
            ) : (
              <SubstDefaultText />
            )}
          </div>
        </div>
      </HotKeys>
    );
  }

  private sliderShift = (newValue: number) => {
    this.setState((state: ISubstVisualizerState) => {
      return { value: newValue };
    });
  };

  private stepFirst = () => {
    // Move to the first step
    this.sliderShift(1);
  };

  private stepLast = (lastStepValue: number) => () => {
    // Move to the last step
    this.sliderShift(lastStepValue);
  };

  private stepPrev = () => {
    this.setState((state: ISubstVisualizerState) => {
      const sliderValue = state.value;
      // Check if we are already at the first item
      const newSliderValue = sliderValue === 1 ? sliderValue : sliderValue - 1;
      return { value: newSliderValue };
    });
  };

  private stepNext = (lastStepValue: number) => () => {
    this.setState((state: ISubstVisualizerState) => {
      const sliderValue = state.value;
      // Check if we are already at the last item
      const newSliderValue = sliderValue === lastStepValue ? sliderValue : sliderValue + 1;
      return { value: newSliderValue };
    });
  };
}

export default SubstVisualizer;
