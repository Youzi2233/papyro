import { forwardRef, useMemo, useCallback } from "react"

// --- UI Primitives ---
import { Button } from "@/components/tiptap-ui-primitive/button"

// --- Lib ---
import { cn } from "@/lib/tiptap-utils"

// --- Icons ---
import { TableColumnIcon } from "@/components/tiptap-icons/table-column-icon"
import { TableRowIcon } from "@/components/tiptap-icons/table-row-icon"

import "./table-grid-selector.scss"

const isCellSelected = (cell, hoveredCell) => {
  if (!hoveredCell) return false
  return cell.row <= hoveredCell.row && cell.col <= hoveredCell.col
}

const generateGridCells = (rows, cols) => {
  const totalCells = rows * cols
  return Array.from({ length: totalCells }, (_, index) => ({
    row: Math.floor(index / cols),
    col: index % cols,
  }));
}

const GridCell = ({
  row,
  col,
  isSelected,
  disabled,
  onMouseEnter,
  onClick
}) => (
  <Button
    size="small"
    type="button"
    className={cn("tiptap-table-grid-cell", isSelected && "selected")}
    disabled={disabled}
    onMouseEnter={onMouseEnter}
    onClick={onClick}
    aria-label={`Select ${row + 1}x${col + 1} table`} />
)

const SizeIndicator = ({
  hoveredCell
}) => {
  const columns = hoveredCell ? hoveredCell.col + 1 : 1
  const rows = hoveredCell ? hoveredCell.row + 1 : 1

  return (
    <div className="tiptap-table-size-indicator">
      <div className="tiptap-table-size-indicator-item">
        <TableColumnIcon className="tiptap-table-column-icon" />
        <span className="tiptap-table-size-indicator-text">{columns}</span>
      </div>
      <span className="tiptap-table-size-indicator-delimiter">x</span>
      <div className="tiptap-table-size-indicator-item">
        <TableRowIcon className="tiptap-table-row-icon" />
        <span className="tiptap-table-size-indicator-text">{rows}</span>
      </div>
    </div>
  );
}

/**
 * Reusable table grid selector component for selecting table dimensions.
 *
 * @example
 * ```tsx
 * const [hoveredCell, setHoveredCell] = useState<CellCoordinates | null>(null)
 *
 * <TableGridSelector
 *   maxRows={8}
 *   maxCols={8}
 *   hoveredCell={hoveredCell}
 *   onCellHover={(row, col) => setHoveredCell({ row, col })}
 *   onCellClick={(row, col) => insertTable(row + 1, col + 1)}
 *   onMouseLeave={() => setHoveredCell(null)}
 * />
 * ```
 */
export const TableGridSelector = forwardRef((
  {
    maxRows = 8,
    maxCols = 8,
    hoveredCell,
    onCellHover,
    onCellClick,
    onMouseLeave,
    disabled = false,
    className,
    showSizeIndicator = true,
  },
  ref
) => {
  const gridCells = useMemo(() => generateGridCells(maxRows, maxCols), [maxRows, maxCols])

  const gridStyle = useMemo(() =>
    ({
      "--tt-table-columns": maxCols,
      "--tt-table-rows": maxRows
    }), [maxCols, maxRows])

  const handleCellHover = useCallback((row, col) => () => onCellHover(row, col), [onCellHover])

  const handleCellClick = useCallback((row, col) => () => onCellClick(row, col), [onCellClick])

  return (
    <>
      <div
        ref={ref}
        className={cn("tiptap-table-grid", className)}
        onMouseLeave={onMouseLeave}
        style={gridStyle}>
        {gridCells.map((cell, index) => (
          <GridCell
            key={index}
            row={cell.row}
            col={cell.col}
            isSelected={isCellSelected(cell, hoveredCell)}
            disabled={disabled}
            onMouseEnter={handleCellHover(cell.row, cell.col)}
            onClick={handleCellClick(cell.row, cell.col)} />
        ))}
      </div>
      {showSizeIndicator && <SizeIndicator hoveredCell={hoveredCell} />}
    </>
  );
})

TableGridSelector.displayName = "TableGridSelector"
