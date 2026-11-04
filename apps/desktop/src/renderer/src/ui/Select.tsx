import { CaretDown, Check } from '@phosphor-icons/react';
import { Menu } from './Menu';

/**
 * In-window option selector. Replaces the native `<select>`: the open popup of
 * a native `<select>` is a separate OS window and therefore is NOT excluded from
 * screen recordings like the rest of the app. Never use `<select>` in Ponto.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  direction = 'down',
  align = 'left',
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
  direction?: 'down' | 'up';
  align?: 'left' | 'right';
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Menu
      className="select-menu"
      direction={direction}
      align={align}
      trigger={({ open, toggle }) => (
        <button type="button" className="select-btn" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={toggle}>
          <span>{current?.label ?? value}</span>
          <CaretDown size={11} weight="bold" />
        </button>
      )}
    >
      {(close) =>
        options.map((o) => (
          <button
            type="button"
            key={o.value}
            className="item"
            role="option"
            aria-selected={o.value === value}
            onClick={() => {
              if (o.value !== value) onChange(o.value);
              close();
            }}
          >
            <span className="label">{o.label}</span>
            {o.value === value && <Check size={13} weight="bold" />}
          </button>
        ))
      }
    </Menu>
  );
}
