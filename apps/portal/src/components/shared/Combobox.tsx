import * as React from 'react'
import { Check, ChevronsUpDown, X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
  hint?: string
}

interface ComboboxProps {
  options: ComboboxOption[]
  value?: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  emptyMessage?: string
  searchPlaceholder?: string
  loading?: boolean
  onCreateNew?: (search: string) => void
  createNewLabel?: string
  disabled?: boolean
  allowClear?: boolean
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Selecionar…',
  emptyMessage = 'Nada encontrado.',
  searchPlaceholder = 'Buscar…',
  loading,
  onCreateNew,
  createNewLabel,
  disabled,
  allowClear = true,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const selected = options.find((o) => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-9 w-full justify-between font-normal',
            !selected && 'text-muted-foreground',
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <span className="flex items-center gap-1">
            {allowClear && selected && !disabled && (
              <span
                role="button"
                aria-label="Limpar seleção"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onChange(null)
                }}
                className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading && (
              <div className="px-3 py-3 text-[12px] text-muted-foreground">Carregando…</div>
            )}
            {!loading && (
              <>
                <CommandEmpty>
                  <div className="space-y-2 px-3 py-3 text-center">
                    <p className="text-[13px] text-muted-foreground">{emptyMessage}</p>
                    {onCreateNew && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setOpen(false)
                          onCreateNew(search)
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {createNewLabel ?? 'Cadastrar novo'}
                      </Button>
                    )}
                  </div>
                </CommandEmpty>
                <CommandGroup>
                  {filterOptions(options, search).map((opt) => (
                    <CommandItem
                      key={opt.value}
                      value={opt.value}
                      onSelect={() => {
                        onChange(opt.value)
                        setOpen(false)
                        setSearch('')
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-3.5 w-3.5',
                          value === opt.value ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <div className="flex flex-1 flex-col">
                        <span className="truncate">{opt.label}</span>
                        {opt.hint && (
                          <span className="truncate text-[11px] text-muted-foreground">
                            {opt.hint}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {onCreateNew && search.length > 0 && filterOptions(options, search).length > 0 && (
                  <div className="border-t p-1">
                    <CommandItem
                      value="__create__"
                      onSelect={() => {
                        setOpen(false)
                        onCreateNew(search)
                      }}
                      className="text-primary"
                    >
                      <Plus className="mr-2 h-3.5 w-3.5" />
                      {createNewLabel ?? `Cadastrar novo "${search}"`}
                    </CommandItem>
                  </div>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function filterOptions(options: ComboboxOption[], search: string): ComboboxOption[] {
  if (!search.trim()) return options.slice(0, 50)
  const t = search.trim().toLowerCase()
  return options
    .filter(
      (o) =>
        o.label.toLowerCase().includes(t) || o.hint?.toLowerCase().includes(t),
    )
    .slice(0, 50)
}
