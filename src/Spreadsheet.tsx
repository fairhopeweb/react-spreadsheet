import React, {
  FC,
  KeyboardEvent,
  MouseEvent,
  PureComponent,
  SyntheticEvent
} from "react";
import { connect } from "unistore/react";
import * as clipboard from "clipboard-polyfill";
import {
  columnIndexToLabel,
  Parser as FormulaParser
} from "hot-formula-parser";
import { Store } from "unistore";
import {
  DataEditor as DataEditorType,
  DataViewer as DataViewerType,
  getBindingsForCell as getBindingsForCellType,
  getValue,
  IStoreState,
  Mode
} from "./types";
import Table, { Props as TableProps } from "./Table";
import Row, { Props as RowProps } from "./Row";
import { enhance as enhanceCell, StaticProps as CellProps } from "./Cell";
import DataViewer from "./DataViewer";
import DataEditor from "./DataEditor";
import ActiveCell from "./ActiveCell";
import Selected from "./Selected";
import Copied from "./Copied";
import { getBindingsForCell } from "./bindings";
import { range, writeTextToClipboard } from "./util";
import { max, min } from "./point-set";
import {
  get as getMatrix,
  getSize,
  join as joinMatrix,
  map as mapMatrix,
  Matrix,
  slice,
  toArray
} from "./matrix";
import {
  copy,
  cut,
  dragEnd,
  dragStart,
  getKeyDownHandler,
  keyDown,
  keyPress,
  paste
} from "./actions";
import "./Spreadsheet.css";

type DefaultCellType = {
  value: string | number | boolean | null;
};

const getValue = ({ data }: { data?: DefaultCellType }) =>
  data ? data.value : null;

export type Props<CellType, Value> = {
  data: Matrix<CellType>;
  columnLabels?: string[];
  ColumnIndicator?: FC<ColumnIndicatorProps>;
  rowLabels?: string[];
  RowIndicator?: FC<RowIndicatorProps>;
  hideRowIndicators?: boolean;
  hideColumnIndicators?: boolean;
  Table: FC<TableProps>;
  Row: FC<RowProps>;
  Cell: FC<CellProps<CellType, Value>>;
  DataViewer: DataViewerType<CellType, Value>;
  DataEditor: DataEditorType<CellType, Value>;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  getValue: getValue<CellType, Value>;
  getBindingsForCell: getBindingsForCellType<CellType>;
  store: Store<any>;
};

type Handlers = {
  cut?: () => void;
  copy?: () => void;
  paste?: () => void;
  setDragging?: (_: boolean) => void;
  onKeyDownAction?: (_: SyntheticEvent<HTMLElement>) => void;
  onKeyPress?: (_: SyntheticEvent<HTMLElement>) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
};

type State = {
  rows: number;
  columns: number;
  mode: Mode;
};

type ColumnIndicatorProps = {
  column: number;
  label?: string | null;
};

const DefaultColumnIndicator: FC<ColumnIndicatorProps> = ({
  column,
  label
}: ColumnIndicatorProps) =>
  label !== undefined ? (
    <th>{label}</th>
  ) : (
    <th>{columnIndexToLabel(column)}</th>
  );

type RowIndicatorProps = {
  row: number;
  label?: string | null;
};

const DefaultRowIndicator: FC<RowIndicatorProps> = ({
  row,
  label
}: RowIndicatorProps) =>
  label !== undefined ? <th>{label}</th> : <th>{row + 1}</th>;

interface SpreadsheetProps<CellType, Value>
  extends Props<CellType, Value>,
    State,
    Handlers {
  data: Matrix<CellType>;
}

class Spreadsheet<CellType, Value> extends PureComponent<
  SpreadsheetProps<CellType, Value>
> {
  static defaultProps = {
    Table,
    Row,
    /** @todo enhance incoming Cell prop */
    Cell: enhanceCell,
    DataViewer,
    DataEditor,
    getValue,
    getBindingsForCell
  };

  constructor(props: SpreadsheetProps<CellType, Value>) {
    super(props);
  }

  formulaParser = new FormulaParser();

  /**
   * Internally used value to check if the copied text match the live objects
   * inside state.copied
   */
  _clippedText: string | null = null;

  clip = () => {
    const { store, getValue } = this.props;
    const { data, selected } = store.getState();
    const startPoint = min(selected);
    const endPoint = max(selected);
    const slicedMatrix = slice(startPoint, endPoint, data);
    const valueMatrix = mapMatrix((value, point) => {
      // Slice makes non-existing cells undefined, empty cells are classically
      // translated to an empty string in join()
      if (value === undefined) {
        return "";
      }
      return getValue({ ...point, data: value as CellType });
    }, slicedMatrix);
    const csv = joinMatrix(valueMatrix);
    this._clippedText = csv;
    writeTextToClipboard(csv);
  };

  unclip = () => {
    this._clippedText = null;
  };

  isFocused(): boolean {
    const { activeElement } = document;

    return this.props.mode === "view" && this.root
      ? this.root === activeElement || this.root.contains(activeElement)
      : false;
  }

  handleCopy = (event: ClipboardEvent) => {
    if (this.isFocused()) {
      event.preventDefault();
      event.stopPropagation();
      this.clip();
      this.props.copy?.();
    }
  };

  handlePaste = async (event: ClipboardEvent) => {
    if (this.props.mode === "view" && this.isFocused()) {
      event.preventDefault();
      event.stopPropagation();
      const text = await clipboard.readText();
      if (text === this._clippedText) {
        this.props.paste?.();
      } else {
        this.unclip();
      }
    }
  };

  handleCut = (event: ClipboardEvent) => {
    if (this.isFocused()) {
      event.preventDefault();
      event.stopPropagation();
      this.clip();
      this.props.cut?.();
    }
  };

  componentWillUnmount() {
    document.removeEventListener("cut", this.handleCut);
    document.removeEventListener("copy", this.handleCopy);
    document.removeEventListener("paste", this.handlePaste);
  }

  componentDidMount() {
    const { store } = this.props;
    document.addEventListener("cut", this.handleCut);
    document.addEventListener("copy", this.handleCopy);
    document.addEventListener("paste", this.handlePaste);
    this.formulaParser.on(
      "callCellValue",
      (
        cellCoord: any,
        done: (
          _: string | boolean | number | boolean | null | undefined
        ) => void
      ) => {
        let value;
        /** @todo More sound error, or at least document */
        try {
          const cell = getMatrix(
            cellCoord.row.index,
            cellCoord.column.index,
            store.getState().data
          );
          value = getValue({ data: cell as DefaultCellType });
        } catch (error) {
          console.error(error);
        } finally {
          done(value);
        }
      }
    );
    this.formulaParser.on(
      "callRangeValue",
      (
        startCellCoord: any,
        endCellCoord: any,
        done: (_?: (string | number | boolean | null)[]) => void
      ) => {
        const startPoint = {
          row: startCellCoord.row.index,
          column: startCellCoord.column.index
        };
        const endPoint = {
          row: endCellCoord.row.index,
          column: endCellCoord.column.index
        };
        const values = toArray(
          slice(startPoint, endPoint, store.getState().data)
        ).map((cell: any) => getValue({ data: cell }));

        done(values);
      }
    );
  }

  handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const { store, onKeyDown, onKeyDownAction } = this.props;
    if (onKeyDown) {
      onKeyDown(event);
    }
    // Do not use event in case preventDefault() was called inside onKeyDown
    if (!event.defaultPrevented) {
      // Only disable default behavior if an handler exist
      if (getKeyDownHandler(store.getState(), event)) {
        event.nativeEvent.preventDefault();
      }
      onKeyDownAction?.(event);
    }
  };

  handleMouseUp = () => {
    this.props.onDragEnd?.();
    document.removeEventListener("mouseup", this.handleMouseUp);
  };

  handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!this.props.store.getState().dragging && event.buttons === 1) {
      this.props.onDragStart?.();
      document.addEventListener("mouseup", this.handleMouseUp);
    }
  };

  root?: HTMLDivElement;

  handleRoot = (root?: HTMLDivElement) => {
    this.root = root;
  };

  render() {
    const {
      Table,
      Row,
      Cell,
      columnLabels,
      rowLabels,
      DataViewer,
      getValue,
      rows,
      columns,
      onKeyPress,
      getBindingsForCell,
      hideColumnIndicators,
      hideRowIndicators
    } = this.props;

    const ColumnIndicator =
      this.props.ColumnIndicator || DefaultColumnIndicator;
    const RowIndicator = this.props.RowIndicator || DefaultRowIndicator;

    return (
      <div
        ref={this.handleRoot}
        className="Spreadsheet"
        onKeyPress={onKeyPress}
        onKeyDown={this.handleKeyDown}
        onMouseMove={this.handleMouseMove}
      >
        <Table columns={columns} hideColumnIndicators={hideColumnIndicators}>
          <tr>
            {!hideRowIndicators && !hideColumnIndicators && <th />}
            {!hideColumnIndicators &&
              range(columns).map(columnNumber =>
                columnLabels ? (
                  <ColumnIndicator
                    key={columnNumber}
                    column={columnNumber}
                    label={
                      columnNumber in columnLabels
                        ? columnLabels[columnNumber]
                        : null
                    }
                  />
                ) : (
                  <ColumnIndicator key={columnNumber} column={columnNumber} />
                )
              )}
          </tr>
          {range(rows).map(rowNumber => (
            <Row key={rowNumber}>
              {!hideRowIndicators &&
                (rowLabels ? (
                  <RowIndicator
                    key={rowNumber}
                    row={rowNumber}
                    label={rowNumber in rowLabels ? rowLabels[rowNumber] : null}
                  />
                ) : (
                  <RowIndicator key={rowNumber} row={rowNumber} />
                ))}
              {range(columns).map(columnNumber => (
                <Cell
                  key={columnNumber}
                  row={rowNumber}
                  column={columnNumber}
                  DataViewer={DataViewer}
                  getValue={getValue}
                  formulaParser={this.formulaParser}
                />
              ))}
            </Row>
          ))}
        </Table>
        <ActiveCell
          DataEditor={DataEditor}
          getValue={getValue}
          getBindingsForCell={getBindingsForCell}
        />
        <Selected />
        <Copied />
      </div>
    );
  }
}

const mapStateToProps = (
  { data, mode }: IStoreState<any>,
  { columnLabels }: Props<any, any>
): State => {
  const { columns, rows } = getSize(data);
  return {
    mode,
    rows,
    columns: columnLabels ? Math.max(columns, columnLabels.length) : columns
  };
};

export default connect(mapStateToProps, {
  copy: copy,
  cut: cut,
  paste: paste,
  onKeyDownAction: keyDown,
  onKeyPress: keyPress,
  onDragStart: dragStart,
  onDragEnd: dragEnd
})(Spreadsheet);
