/* eslint-disable @typescript-eslint/no-empty-object-type */
/**
 * Radix UI v2 module augmentation
 *
 * Radix UI v2 removed standard HTML attributes (className, children, id, style)
 * from their TypeScript prop interfaces. These attributes still work at runtime —
 * Radix forwards them to the underlying DOM elements — but TypeScript rejects them.
 *
 * This file augments the Radix interfaces to re-add those attributes so the
 * codebase compiles without errors or @ts-ignore comments.
 */

import type { ReactNode, CSSProperties } from "react";

// Common HTML attributes missing from Radix v2 types
interface RadixHTMLFix {
  className?: string;
  children?: ReactNode;
  id?: string;
  style?: CSSProperties;
  asChild?: boolean;
  onClick?: (event: React.MouseEvent) => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
}

// ─── @radix-ui/react-select ────────────────────────────────────────────────

declare module "@radix-ui/react-select" {
  interface SelectTriggerProps extends RadixHTMLFix {}
  interface SelectContentProps extends RadixHTMLFix {}
  interface SelectItemProps extends RadixHTMLFix {}
  interface SelectViewportProps extends RadixHTMLFix {}
  interface SelectLabelProps extends RadixHTMLFix {}
  interface SelectSeparatorProps extends RadixHTMLFix {}
  interface SelectScrollUpButtonProps extends RadixHTMLFix {}
  interface SelectScrollDownButtonProps extends RadixHTMLFix {}
  interface SelectIconProps extends RadixHTMLFix {}
  interface SelectValueProps extends RadixHTMLFix {}
  interface SelectItemTextProps extends RadixHTMLFix {}
}

// ─── @radix-ui/react-dialog ────────────────────────────────────────────────

declare module "@radix-ui/react-dialog" {
  interface DialogOverlayProps extends RadixHTMLFix {}
  interface DialogContentProps extends RadixHTMLFix {}
  interface DialogTitleProps extends RadixHTMLFix {}
  interface DialogDescriptionProps extends RadixHTMLFix {}
  interface DialogCloseProps extends RadixHTMLFix {}
  interface DialogTriggerProps extends RadixHTMLFix {}
}

// ─── @radix-ui/react-dropdown-menu ─────────────────────────────────────────

declare module "@radix-ui/react-dropdown-menu" {
  interface DropdownMenuTriggerProps extends RadixHTMLFix {}
  interface DropdownMenuContentProps extends RadixHTMLFix {}
  interface DropdownMenuItemProps extends RadixHTMLFix {}
  interface DropdownMenuCheckboxItemProps extends RadixHTMLFix {
    checked?: boolean;
  }
  interface DropdownMenuRadioItemProps extends RadixHTMLFix {}
  interface DropdownMenuLabelProps extends RadixHTMLFix {}
  interface DropdownMenuSeparatorProps extends RadixHTMLFix {}
  interface DropdownMenuSubTriggerProps extends RadixHTMLFix {}
  interface DropdownMenuSubContentProps extends RadixHTMLFix {}
  interface DropdownMenuGroupProps extends RadixHTMLFix {}
}

// ─── @radix-ui/react-label ─────────────────────────────────────────────────

declare module "@radix-ui/react-label" {
  interface LabelProps extends RadixHTMLFix {
    htmlFor?: string;
  }
}

// ─── @radix-ui/react-scroll-area ───────────────────────────────────────────

declare module "@radix-ui/react-scroll-area" {
  interface ScrollAreaProps extends RadixHTMLFix {}
  interface ScrollAreaViewportProps extends RadixHTMLFix {}
  interface ScrollAreaScrollbarProps extends RadixHTMLFix {}
  interface ScrollAreaThumbProps extends RadixHTMLFix {}
  interface ScrollAreaCornerProps extends RadixHTMLFix {}
}

// ─── @radix-ui/react-separator ─────────────────────────────────────────────

declare module "@radix-ui/react-separator" {
  interface SeparatorProps extends RadixHTMLFix {}
}

// ─── @radix-ui/react-switch ────────────────────────────────────────────────

declare module "@radix-ui/react-switch" {
  interface SwitchProps extends RadixHTMLFix {}
  interface SwitchThumbProps extends RadixHTMLFix {}
}

// ─── @radix-ui/react-tabs ──────────────────────────────────────────────────

declare module "@radix-ui/react-tabs" {
  interface TabsProps extends RadixHTMLFix {}
  interface TabsListProps extends RadixHTMLFix {}
  interface TabsTriggerProps extends RadixHTMLFix {}
  interface TabsContentProps extends RadixHTMLFix {}
}

// ─── @radix-ui/react-tooltip ───────────────────────────────────────────────

declare module "@radix-ui/react-tooltip" {
  interface TooltipTriggerProps extends RadixHTMLFix {}
  interface TooltipContentProps extends RadixHTMLFix {}
}

// ─── @radix-ui/react-collapsible ───────────────────────────────────────────

declare module "@radix-ui/react-collapsible" {
  interface CollapsibleProps extends RadixHTMLFix {}
  interface CollapsibleTriggerProps extends RadixHTMLFix {}
  interface CollapsibleContentProps extends RadixHTMLFix {}
}
