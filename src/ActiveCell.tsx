import React, { Component } from "react";
import classnames from "classnames";
import { connect } from "unistore/react";

import { get } from "./matrix";
import { commit as commitAction, edit, setCellData } from "./actions";
import {
  commit as commitType,
  DataEditor,
  getBindingsForCell,
  getValue,
  IDimensions,
  IPoint,
  IStoreState,
  Mode
} from "./types";
import { getCellDimensions } from "./util";

type State<Cell> = {
  cellBeforeUpdate: Cell;
};

type Props<Cell, Value> = {
  DataEditor: DataEditor<Cell, Value>;
  getValue: getValue<Cell, Value>;
  onChange: (data: Cell) => void;
  setData: (active: IPoint, data: Cell, bindings: IPoint[]) => void;
  cell: Cell;
  hidden: boolean;
  mode: Mode;
  edit: () => void;
  commit: commitType<Cell>;
  getBindingsForCell: getBindingsForCell<Cell>;
} & IPoint &
  IDimensions;

class ActiveCell<Cell, Value> extends Component<
  Props<Cell, Value>,
  State<any>
> {
  state = { cellBeforeUpdate: null };

  handleChange = (row: number, column: number, cell: Cell) => {
    const { setData, getBindingsForCell } = this.props;
    const bindings = getBindingsForCell(cell);


    setData({ row, column }, cell, bindings);
  };

  // NOTE: Currently all logics here belongs to commit event
  componentDidUpdate(prevProps: Props<Cell, Value>) {
    const { cell, mode, commit } = this.props;

    if (cell || cell === undefined) {
      if (prevProps.mode === "view" && mode === "edit") {
        this.setState({ cellBeforeUpdate: prevProps.cell });
      } else if (
        prevProps.mode === "edit" &&
        prevProps.mode !== this.props.mode &&
        prevProps.cell &&
        prevProps.cell !== this.state.cellBeforeUpdate
      ) {
        commit([
          { prevCell: this.state.cellBeforeUpdate, nextCell: prevProps.cell }
        ]);
      }
    }
  }

  render() {
    let { DataEditor } = this.props;
    const {
      getValue,
      row,
      column,
      cell,
      width,
      height,
      top,
      left,
      hidden,
      mode,
      edit
    } = this.props;
    DataEditor = (cell && cell.DataEditor) || DataEditor;
    const readOnly = cell && cell.readOnly;
    return hidden ? null : (
      <div
        className={classnames("ActiveCell", mode)}
        style={{ width, height, top, left }}
        onClick={mode === "view" && !readOnly ? edit : undefined}
      >
        {mode === "edit" && (
          <DataEditor
            row={row}
            column={column}
            cell={cell}
            onChange={(cell: Cell) => this.handleChange(row, column, cell)}
            getValue={getValue}
          />
        )}
      </div>
    );
  }
}

const mapStateToProps = (state: IStoreState<any>) => {
  const dimensions = state.active && getCellDimensions(state.active, state);
  if (!state.active || !dimensions) {
    return { hidden: true };
  }
  return {
    hidden: false,
    ...state.active,
    cell: get(state.active.row, state.active.column, state.data),
    width: dimensions.width,
    height: dimensions.height,
    top: dimensions.top,
    left: dimensions.left,
    mode: state.mode
  };
};

export default connect(mapStateToProps, {
  setCellData: setCellData,
  edit: edit,
  commit: commitAction
})(ActiveCell);
