import React, { Component, ReactChildren } from "react";
import * as Types from "./types";

type Cell = {
  component?: Component<{
    row: number;
    column: number;
    value: ReactChildren;
  }>;
};

type Props = Types.ICellComponentProps<Cell, Node> & {
  formulaParser: any; // FormulaParser for hot-formula-parser
};

const toView = (value: boolean | string | Node) => {
  if (typeof value === "boolean") {
    return <div className='boolean'>{value ? "TRUE" : "FALSE"}</div>;
  }

  return value;
};

const DataViewer: React.FC<Props> = ({
  getValue,
  cell,
  column,
  row,
  formulaParser
}: Props) => {
  const rawValue = getValue({ data: cell, column, row }) as
    | boolean
    | string
    | Node;
  if (typeof rawValue === "string" && rawValue.startsWith("=")) {
    const { result, error } = formulaParser.parse(rawValue.slice(1));
    return error || toView(result);
  }

  return toView(rawValue);
};

export default DataViewer;
