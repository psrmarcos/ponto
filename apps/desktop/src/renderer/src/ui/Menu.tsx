import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface Props {
  trigger: (state: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
  direction?: 'down' | 'up';
  align?: 'left' | 'right';
}

const MARGIN = 8;
const GAP = 4;

export function Menu({ trigger, children, className = '', direction = 'down', align = 'left' }: Props) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEsc);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEsc);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !menuRef.current) {
      setStyle(null);
      return;
    }
    const btnRect = anchorRef.current.getBoundingClientRect();
    const contentHeight = menuRef.current.scrollHeight;
    const naturalWidth = menuRef.current.offsetWidth;
    const spaceBelow = window.innerHeight - btnRect.bottom - MARGIN - GAP;
    const spaceAbove = btnRect.top - MARGIN - GAP;
    const openAbove =
      direction === 'up' ? contentHeight <= spaceAbove || spaceAbove > spaceBelow : contentHeight > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.floor(openAbove ? spaceAbove : spaceBelow));
    const height = Math.min(contentHeight, maxHeight);
    const width = Math.min(naturalWidth, window.innerWidth - 2 * MARGIN);
    let left = align === 'right' ? btnRect.right - width : btnRect.left;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - MARGIN - width));
    setStyle({
      position: 'fixed',
      left: Math.round(left),
      top: Math.round(openAbove ? btnRect.top - GAP - height : btnRect.bottom + GAP),
      right: 'auto',
      bottom: 'auto',
      maxHeight,
      overflowY: 'auto',
      width: width < naturalWidth ? width : undefined,
    });
  }, [open, direction, align]);

  return (
    <div className="anchor" ref={anchorRef}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      <div
        ref={menuRef}
        className={`menu ${className}${open ? ' open' : ''}`}
        role="menu"
        style={style ?? (open ? { visibility: 'hidden' } : undefined)}
      >
        {children(() => setOpen(false))}
      </div>
    </div>
  );
}
