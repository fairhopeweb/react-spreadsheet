import React from "react";
import classnames from "classnames";
import { connect } from "unistore/react";

import * as PointSet from "./point-set";
import FloatingRect, { mapStateToProps } from "./FloatingRect";
import { default as Types, IStoreState } from "./types";

type Props = {
  className?: string;
  hidden?: boolean;
  dragging: boolean;
} & Types.IDimensions;

const Selected = ({ dragging, ...rest }: Props) => (
  <FloatingRect {...rest} className={classnames("selected", { dragging })} />
);

export default connect((state: IStoreState<any>) => {
  const cells = state.selected;
  const nextState = mapStateToProps(cells)(state);
  return {
    ...nextState,
    hidden: nextState.hidden || PointSet.size(cells) === 1,
    dragging: state.dragging
  };
})(Selected);
