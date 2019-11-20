import React from "react";
import { connect } from "unistore/react";

import { from } from "./point-set";
import { map } from "./point-map";
import FloatingRect, { mapStateToProps } from "./FloatingRect";
import { IStoreState } from "./types";

const Copied = (props: any) => <FloatingRect {...props} className="copied" />;

export default connect((state: IStoreState<any>) =>
  mapStateToProps(state.hasPasted ? from([]) : map(() => true, state.copied))(
    state
  )
)(Copied);
