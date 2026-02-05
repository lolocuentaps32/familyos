import './ConfirmModal.css'

interface Props {
    isOpen: boolean
    title?: string
    message: string
    confirmText?: string
    cancelText?: string
    variant?: 'danger' | 'warning' | 'default'
    onConfirm: () => void
    onCancel: () => void
}

export default function ConfirmModal({
    isOpen,
    title = '¿Estás seguro?',
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    variant = 'default',
    onConfirm,
    onCancel
}: Props) {
    if (!isOpen) return null

    return (
        <div className="confirm-overlay" onClick={onCancel}>
            <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="confirm-icon">
                    {variant === 'danger' && '🗑️'}
                    {variant === 'warning' && '⚠️'}
                    {variant === 'default' && '❓'}
                </div>
                <h3 className="confirm-title">{title}</h3>
                <p className="confirm-message">{message}</p>
                <div className="confirm-actions">
                    <button className="confirm-btn confirm-btn-cancel" onClick={onCancel}>
                        {cancelText}
                    </button>
                    <button
                        className={`confirm-btn confirm-btn-${variant}`}
                        onClick={onConfirm}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    )
}
