import * as Ariakit from "@ariakit/react"
import { cn } from "@/lib/tiptap-utils"
import "@/components/tiptap-ui-primitive/combobox/combobox.scss"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "../input-group"

function ComboboxProvider({
  ...props
}) {
  return (<Ariakit.ComboboxProvider includesBaseElement={false} resetValueOnHide {...props} />);
}

function ComboboxLabel({
  className,
  ...props
}) {
  return (
    <Ariakit.ComboboxLabel
      data-slot="tiptap-combobox-label"
      className={cn("tiptap-combobox-label", className)}
      {...props} />
  );
}

function Combobox({
  className,
  ...props
}) {
  return (<Ariakit.Combobox autoSelect {...props} className={cn("tiptap-combobox", className)} />);
}

function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}) {
  return (
    <InputGroup className={cn(className)}>
      <Ariakit.Combobox render={<InputGroupInput disabled={disabled} />} {...props} />
      <InputGroupAddon align="inline-end">
        {showTrigger && (
          <Ariakit.ComboboxDisclosure
            render={
              <InputGroupButton
                size="icon-xs"
                variant="ghost"
                data-slot="input-group-button"
                disabled={disabled} />
            } />
        )}
        {showClear && <ComboboxCancel disabled={disabled} />}
      </InputGroupAddon>
      {children}
    </InputGroup>
  );
}

function ComboboxCancel({
  className,
  ...props
}) {
  return (
    <Ariakit.ComboboxCancel
      data-slot="tiptap-combobox-cancel"
      className={cn("tiptap-combobox-cancel", className)}
      {...props} />
  );
}

function ComboboxDisclosure({
  className,
  ...props
}) {
  return (
    <Ariakit.ComboboxDisclosure
      data-slot="tiptap-combobox-disclosure"
      className={cn("tiptap-combobox-disclosure", className)}
      {...props} />
  );
}

function ComboboxValue({
  ...props
}) {
  return <Ariakit.ComboboxValue data-slot="tiptap-combobox-value" {...props} />;
}

function ComboboxList({
  className,
  ...props
}) {
  return (
    <Ariakit.ComboboxList
      data-slot="tiptap-combobox-list"
      className={cn("tiptap-combobox-list", className)}
      {...props} />
  );
}

function ComboboxPopover({
  className,
  ...props
}) {
  return (
    <Ariakit.ComboboxPopover
      data-slot="tiptap-combobox-popover"
      className={cn("tiptap-combobox-popover", className)}
      {...props} />
  );
}

function ComboboxGroup({
  className,
  ...props
}) {
  return (
    <Ariakit.ComboboxGroup
      data-slot="tiptap-combobox-group"
      className={cn("tiptap-combobox-group", className)}
      {...props} />
  );
}

function ComboboxGroupLabel({
  className,
  ...props
}) {
  return (
    <Ariakit.ComboboxGroupLabel
      data-slot="tiptap-combobox-group-label"
      className={cn("tiptap-combobox-group-label", className)}
      {...props} />
  );
}

function ComboboxRow({
  className,
  ...props
}) {
  return (
    <Ariakit.ComboboxRow
      data-slot="tiptap-combobox-row"
      className={cn("tiptap-combobox-row", className)}
      {...props} />
  );
}

function ComboboxItem({
  className,
  ...props
}) {
  return (
    <Ariakit.ComboboxItem
      data-slot="tiptap-combobox-item"
      className={cn("tiptap-combobox-item", className)}
      {...props} />
  );
}

function ComboboxItemCheck({
  className,
  ...props
}) {
  return (
    <Ariakit.ComboboxItemCheck
      data-slot="tiptap-combobox-item-check"
      className={cn("tiptap-combobox-item-check", className)}
      {...props} />
  );
}

function ComboboxItemValue({
  className,
  ...props
}) {
  return (
    <Ariakit.ComboboxItemValue
      data-slot="tiptap-combobox-item-value"
      className={cn("tiptap-combobox-item-value", className)}
      {...props} />
  );
}

export {
  ComboboxProvider,
  ComboboxLabel,
  Combobox,
  ComboboxInput,
  ComboboxCancel,
  ComboboxDisclosure,
  ComboboxValue,
  ComboboxList,
  ComboboxPopover,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxRow,
  ComboboxItem,
  ComboboxItemCheck,
  ComboboxItemValue,
}
