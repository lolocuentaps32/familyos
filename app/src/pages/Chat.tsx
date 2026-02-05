import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useActiveFamily } from '../lib/useActiveFamily'
import './Chat.css'

type Message = {
    id: string
    content: string | null
    media_url: string | null
    media_type: string | null
    created_at: string
    updated_at: string
    is_deleted: boolean
    sender_member_id: string
    sender: { display_name: string; avatar_url: string | null } | null
    reply_to: { id: string; content: string | null; sender: { display_name: string } | null } | null
}

type Member = {
    id: string
    display_name: string
    avatar_url: string | null
}

export default function ChatPage() {
    const { activeFamilyId, myMember } = useActiveFamily()
    const [messages, setMessages] = useState<Message[]>([])
    const [members, setMembers] = useState<Member[]>([])
    const [newMessage, setNewMessage] = useState('')
    const [replyTo, setReplyTo] = useState<Message | null>(null)
    const [editingMessage, setEditingMessage] = useState<Message | null>(null)
    const [activeMessageMenu, setActiveMessageMenu] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState(false)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    // Load messages
    const loadMessages = useCallback(async () => {
        if (!activeFamilyId) return

        const { data: messagesData, error } = await supabase
            .from('chat_messages')
            .select(`
                id, content, media_url, media_type, created_at, updated_at, is_deleted, sender_member_id,
                sender:sender_member_id(display_name, avatar_url),
                reply_to:reply_to_id(id, content, sender:sender_member_id(display_name))
            `)
            .eq('family_id', activeFamilyId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: true })
            .limit(100)

        if (!error && messagesData) {
            setMessages(messagesData as any)
        }

        setLoading(false)
    }, [activeFamilyId])

    // Load members directly from members table
    const loadMembers = useCallback(async () => {
        if (!activeFamilyId) return

        const { data } = await supabase
            .from('members')
            .select('id, display_name, avatar_url')
            .eq('family_id', activeFamilyId)

        if (data) {
            setMembers(data)
        }
    }, [activeFamilyId])

    // Setup real-time subscription
    useEffect(() => {
        if (!activeFamilyId) return

        loadMembers()
        loadMessages()

        // Subscribe to messages
        const channel = supabase
            .channel(`chat:${activeFamilyId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'chat_messages',
                    filter: `family_id=eq.${activeFamilyId}`
                },
                async (payload) => {
                    if (payload.eventType === 'INSERT') {
                        const { data } = await supabase
                            .from('chat_messages')
                            .select(`
                                id, content, media_url, media_type, created_at, updated_at, is_deleted, sender_member_id,
                                sender:sender_member_id(display_name, avatar_url),
                                reply_to:reply_to_id(id, content, sender:sender_member_id(display_name))
                            `)
                            .eq('id', payload.new.id)
                            .single()

                        if (data && !data.is_deleted) {
                            setMessages(prev => [...prev, data as any])
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        if (payload.new.is_deleted) {
                            setMessages(prev => prev.filter(m => m.id !== payload.new.id))
                        } else {
                            // Refresh the updated message
                            const { data } = await supabase
                                .from('chat_messages')
                                .select(`
                                    id, content, media_url, media_type, created_at, updated_at, is_deleted, sender_member_id,
                                    sender:sender_member_id(display_name, avatar_url),
                                    reply_to:reply_to_id(id, content, sender:sender_member_id(display_name))
                                `)
                                .eq('id', payload.new.id)
                                .single()

                            if (data) {
                                setMessages(prev => prev.map(m => m.id === data.id ? data as any : m))
                            }
                        }
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [activeFamilyId, loadMessages, loadMembers])

    // Scroll to bottom when messages change
    useEffect(() => {
        scrollToBottom()
    }, [messages])

    // Mark messages as read
    useEffect(() => {
        if (!activeFamilyId || messages.length === 0) return

        const lastMessage = messages[messages.length - 1]
        supabase.rpc('mark_messages_as_read', {
            _family_id: activeFamilyId,
            _message_id: lastMessage.id
        }).catch(() => { })
    }, [activeFamilyId, messages])

    // Close message menu when clicking outside
    useEffect(() => {
        function handleClickOutside() {
            setActiveMessageMenu(null)
        }
        document.addEventListener('click', handleClickOutside)
        return () => document.removeEventListener('click', handleClickOutside)
    }, [])

    // Send or update message
    async function sendMessage(e?: React.FormEvent) {
        e?.preventDefault()

        if (!newMessage.trim() || !activeFamilyId || !myMember || sending) return

        setSending(true)

        if (editingMessage) {
            // Update existing message
            const { error } = await supabase
                .from('chat_messages')
                .update({ content: newMessage.trim(), updated_at: new Date().toISOString() })
                .eq('id', editingMessage.id)

            if (!error) {
                setNewMessage('')
                setEditingMessage(null)
            }
        } else {
            // Create new message
            const { error } = await supabase.from('chat_messages').insert({
                family_id: activeFamilyId,
                sender_member_id: myMember.id,
                content: newMessage.trim(),
                reply_to_id: replyTo?.id || null
            })

            if (!error) {
                setNewMessage('')
                setReplyTo(null)
                inputRef.current?.focus()
            }
        }

        setSending(false)
    }

    // Delete message
    async function deleteMessage(msg: Message) {
        await supabase
            .from('chat_messages')
            .update({ is_deleted: true })
            .eq('id', msg.id)
        setActiveMessageMenu(null)
    }

    // Start editing message
    function startEditing(msg: Message) {
        setEditingMessage(msg)
        setNewMessage(msg.content || '')
        setReplyTo(null)
        setActiveMessageMenu(null)
        inputRef.current?.focus()
    }

    // Cancel editing
    function cancelEditing() {
        setEditingMessage(null)
        setNewMessage('')
    }

    // Handle file upload
    async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file || !activeFamilyId || !myMember) return

        setSending(true)

        let mediaType = 'file'
        if (file.type.startsWith('image/')) mediaType = 'image'
        else if (file.type.startsWith('video/')) mediaType = 'video'
        else if (file.type.startsWith('audio/')) mediaType = 'audio'

        const fileName = `${activeFamilyId}/${Date.now()}_${file.name}`
        const { error: uploadError } = await supabase.storage
            .from('family-media')
            .upload(fileName, file)

        if (uploadError) {
            console.error('Upload error:', uploadError)
            setSending(false)
            return
        }

        const { data: urlData } = supabase.storage
            .from('family-media')
            .getPublicUrl(fileName)

        await supabase.from('chat_messages').insert({
            family_id: activeFamilyId,
            sender_member_id: myMember.id,
            content: null,
            media_url: urlData.publicUrl,
            media_type: mediaType,
            reply_to_id: replyTo?.id || null
        })

        setReplyTo(null)
        setSending(false)

        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
        }
        if (e.key === 'Escape' && editingMessage) {
            cancelEditing()
        }
    }

    function formatTime(iso: string) {
        const date = new Date(iso)
        const now = new Date()
        const isToday = date.toDateString() === now.toDateString()

        if (isToday) {
            return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        }

        return date.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    function groupMessagesByDate(msgs: Message[]) {
        const groups: { date: string; messages: Message[] }[] = []
        let currentDate = ''

        msgs.forEach(msg => {
            const msgDate = new Date(msg.created_at).toDateString()
            if (msgDate !== currentDate) {
                currentDate = msgDate
                groups.push({
                    date: new Date(msg.created_at).toLocaleDateString('es-ES', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long'
                    }),
                    messages: [msg]
                })
            } else {
                groups[groups.length - 1].messages.push(msg)
            }
        })

        return groups
    }

    function toggleMessageMenu(e: React.MouseEvent, msgId: string) {
        e.stopPropagation()
        setActiveMessageMenu(activeMessageMenu === msgId ? null : msgId)
    }

    if (loading) {
        return (
            <div className="page chat-page">
                <div className="loading-spinner">Cargando mensajes...</div>
            </div>
        )
    }

    const messageGroups = groupMessagesByDate(messages)

    return (
        <div className="page chat-page">
            {/* Chat Header */}
            <div className="chat-header">
                <h2>💬 Chat Familiar</h2>
                <span className="chat-members">{members.length} miembros</span>
            </div>

            {/* Messages Container */}
            <div className="chat-messages">
                {messages.length === 0 ? (
                    <div className="empty-chat">
                        <span className="empty-icon">💬</span>
                        <p>¡Empieza la conversación!</p>
                        <p className="empty-hint">Escribe un mensaje para tu familia</p>
                    </div>
                ) : (
                    messageGroups.map((group, gi) => (
                        <div key={gi} className="message-group">
                            <div className="date-divider">
                                <span>{group.date}</span>
                            </div>

                            {group.messages.map((msg, mi) => {
                                const isOwn = msg.sender_member_id === myMember?.id
                                const showAvatar = mi === 0 ||
                                    group.messages[mi - 1].sender_member_id !== msg.sender_member_id
                                const isEdited = msg.updated_at !== msg.created_at

                                return (
                                    <div
                                        key={msg.id}
                                        className={`message ${isOwn ? 'own' : 'other'} ${showAvatar ? 'with-avatar' : ''}`}
                                    >
                                        {!isOwn && showAvatar && (
                                            <div className="message-avatar">
                                                {msg.sender?.avatar_url ? (
                                                    <img src={msg.sender.avatar_url} alt="" />
                                                ) : (
                                                    <span>{msg.sender?.display_name?.charAt(0) || '?'}</span>
                                                )}
                                            </div>
                                        )}

                                        <div className="message-bubble">
                                            {!isOwn && showAvatar && (
                                                <span className="message-sender">{msg.sender?.display_name}</span>
                                            )}

                                            {msg.reply_to && (
                                                <div className="message-reply-quote">
                                                    <span className="reply-sender">{msg.reply_to.sender?.display_name}</span>
                                                    <span className="reply-content">{msg.reply_to.content?.slice(0, 50) || 'Media'}</span>
                                                </div>
                                            )}

                                            {msg.media_url && (
                                                <div className="message-media">
                                                    {msg.media_type === 'image' && (
                                                        <img src={msg.media_url} alt="" onClick={() => window.open(msg.media_url!, '_blank')} />
                                                    )}
                                                    {msg.media_type === 'video' && (
                                                        <video src={msg.media_url} controls />
                                                    )}
                                                    {msg.media_type === 'audio' && (
                                                        <audio src={msg.media_url} controls />
                                                    )}
                                                </div>
                                            )}

                                            {msg.content && (
                                                <p className="message-text">{msg.content}</p>
                                            )}

                                            <span className="message-time">
                                                {isEdited && <span className="edited-label">editado · </span>}
                                                {formatTime(msg.created_at)}
                                            </span>
                                        </div>

                                        {/* Message Actions */}
                                        <div className="message-actions">
                                            <button
                                                className="message-action-btn"
                                                onClick={(e) => toggleMessageMenu(e, msg.id)}
                                                title="Opciones"
                                            >
                                                ⋮
                                            </button>

                                            {activeMessageMenu === msg.id && (
                                                <div className="message-menu" onClick={e => e.stopPropagation()}>
                                                    <button onClick={() => { setReplyTo(msg); setActiveMessageMenu(null) }}>
                                                        ↩ Responder
                                                    </button>
                                                    {isOwn && msg.content && (
                                                        <button onClick={() => startEditing(msg)}>
                                                            ✏️ Editar
                                                        </button>
                                                    )}
                                                    {isOwn && (
                                                        <button className="danger" onClick={() => deleteMessage(msg)}>
                                                            🗑️ Eliminar
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Reply/Edit Preview */}
            {(replyTo || editingMessage) && (
                <div className={`input-preview ${editingMessage ? 'editing' : ''}`}>
                    <div className="preview-info">
                        {editingMessage ? (
                            <>
                                <span className="preview-label">✏️ Editando mensaje</span>
                                <span className="preview-text">{editingMessage.content?.slice(0, 50)}</span>
                            </>
                        ) : (
                            <>
                                <span className="preview-label">↩ Respondiendo a {replyTo?.sender?.display_name}</span>
                                <span className="preview-text">{replyTo?.content?.slice(0, 50) || 'Media'}</span>
                            </>
                        )}
                    </div>
                    <button className="preview-cancel" onClick={() => {
                        if (editingMessage) cancelEditing()
                        else setReplyTo(null)
                    }}>✕</button>
                </div>
            )}

            {/* Input Area */}
            <form className="chat-input-area" onSubmit={sendMessage}>
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept="image/*,video/*,audio/*"
                    hidden
                />

                {!editingMessage && (
                    <button
                        type="button"
                        className="chat-attach-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={sending}
                    >
                        📎
                    </button>
                )}

                <textarea
                    ref={inputRef}
                    className="chat-input"
                    placeholder={editingMessage ? "Editar mensaje..." : "Escribe un mensaje..."}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    disabled={sending}
                />

                <button
                    type="submit"
                    className="chat-send-btn"
                    disabled={!newMessage.trim() || sending}
                >
                    {sending ? '⏳' : editingMessage ? '✓' : '➤'}
                </button>
            </form>
        </div>
    )
}
