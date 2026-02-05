import { useState, useRef, useEffect } from 'react'
import './AddMenu.css'

export type CreateType = 'event' | 'task' | 'shopping' | 'bill' | 'routine'

interface AddMenuProps {
    onSelect: (type: CreateType) => void
}

const menuItems: { type: CreateType; icon: string; label: string }[] = [
    { type: 'event', icon: '📅', label: 'Nuevo Evento' },
    { type: 'task', icon: '✅', label: 'Nueva Tarea' },
    { type: 'shopping', icon: '🛒', label: 'Artículo de Compra' },
    { type: 'bill', icon: '💰', label: 'Factura Recurrente' },
    { type: 'routine', icon: '📋', label: 'Nueva Rutina' },
]

export default function AddMenu({ onSelect }: AddMenuProps) {
    const [open, setOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        if (open) {
            document.addEventListener('mousedown', handleClickOutside)
        }
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [open])

    function handleSelect(type: CreateType) {
        setOpen(false)
        onSelect(type)
    }

    return (
        <div className="add-menu-wrapper" ref={menuRef}>
            <button className="add-menu-trigger" onClick={() => setOpen(!open)}>
                <span className="add-menu-icon">+</span>
                <span className="add-menu-label">Añadir</span>
            </button>

            <div className={`add-menu-dropdown ${open ? 'open' : ''}`}>
                {menuItems.map((item, i) => (
                    <button
                        key={item.type}
                        className="add-menu-item"
                        style={{ animationDelay: `${i * 0.03}s` }}
                        onClick={() => handleSelect(item.type)}
                    >
                        <span className="add-menu-item-icon">{item.icon}</span>
                        <span className="add-menu-item-label">{item.label}</span>
                    </button>
                ))}
            </div>
        </div>
    )
}
