import { ReactNode, useEffect, useState } from 'react'
import './Modal.css'

interface ModalProps {
    isOpen: boolean
    onClose: () => void
    title: string
    children: ReactNode
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
    const [visible, setVisible] = useState(false)
    const [animating, setAnimating] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setVisible(true)
            requestAnimationFrame(() => setAnimating(true))
        } else {
            setAnimating(false)
            const timer = setTimeout(() => setVisible(false), 250)
            return () => clearTimeout(timer)
        }
    }, [isOpen])

    if (!visible) return null

    return (
        <div className={`modal-backdrop ${animating ? 'open' : ''}`} onClick={onClose}>
            <div className={`modal-content ${animating ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">{title}</h3>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="modal-body">
                    {children}
                </div>
            </div>
        </div>
    )
}
