"use client";

import * as React from "react";

import { useMediaQuery } from "@uidotdev/usehooks";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DialogDescription } from "./dialog";

type ComboboxItem = {
  value: string;
  label: string;
};

export function ComboBox({
  items,
  value,
  onChange,
  allowedNoValue,
  disabled,
}: {
  items: ComboboxItem[];
  value?: ComboboxItem["value"];
  onChange: (item?: ComboboxItem["value"]) => void;
  allowedNoValue?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const selectedItem = items.find((i) => i.value === value);

  const trigger = (
    <Button variant="outline" className="justify-between">
      {selectedItem ? <>{selectedItem.label}</> : <>Select</>}
      <ChevronsUpDown />
    </Button>
  );

  const itemList = (
    <ItemList
      items={items}
      value={value}
      setValue={onChange}
      setOpen={setOpen}
      allowedNoValue={allowedNoValue}
    />
  );

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger disabled={disabled} asChild>
          {trigger}
        </PopoverTrigger>
        <PopoverContent className="p-0" align="center">
          {itemList}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger disabled={disabled} asChild>
        {trigger}
      </DrawerTrigger>
      <DrawerContent>
        <DrawerTitle></DrawerTitle>
        <DialogDescription></DialogDescription>
        <div className="mt-4 border-t">{itemList}</div>
      </DrawerContent>
    </Drawer>
  );
}

function ItemList({
  items,
  value,
  setValue,
  setOpen,
  allowedNoValue,
}: {
  items: ComboboxItem[];
  value?: ComboboxItem["value"];
  setValue: (item?: ComboboxItem["value"]) => void;
  setOpen: (open: boolean) => void;
  allowedNoValue?: boolean;
}) {
  return (
    <Command>
      <CommandInput placeholder="Search" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup>
          {items.map((item) => {
            const selected = item.value === value;
            return (
              <CommandItem
                key={item.value}
                value={item.value}
                onSelect={() => {
                  setValue(selected && allowedNoValue ? undefined : item.value);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-1.5 size-4 shrink-0 transition-transform",
                    selected ? "scale-100" : "scale-0"
                  )}
                />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
