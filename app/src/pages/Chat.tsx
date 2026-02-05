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
    const [members, setMembers] = useState<Map<string, Member>>(new Map())
    const [newMessage, setNewMessage] = useState('')
    const [replyTo, setReplyTo] = useState<Message | null>(null)
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
        id, content, media_url, media_type, created_at, is_deleted, sender_member_id,
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

    // Load members
    const loadMembers = useCallback(async () => {
        if (!activeFamilyId) return

        const { data } = await supabase
            .from('members')
            .select('id, display_name, avatar_url')
            .eq('family_id', activeFamilyId)

        if (data) {
            const membersMap = new Map<string, Member>()
            data.forEach(m => membersMap.set(m.id, m))
            setMembers(membersMap)
        }
    }, [activeFamilyId])

    // Setup real-time subscription
    useEffect(() => {
        if (!activeFamilyId) return

        loadMembers()
        loadMessages()

        // Subscribe to new messages
        const channel = supabase
            .channel(`chat:${activeFamilyId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages',
                    filter: `family_id=eq.${activeFamilyId}`
                },
                async (payload) => {
                    // Fetch full message with relations
                    const { data } = await supabase
                        .from('chat_messages')
                        .select(`
              id, content, media_url, media_type, created_at, is_deleted, sender_member_id,
              sender:sender_member_id(display_name, avatar_url),
              reply_to:reply_to_id(id, content, sender:sender_member_id(display_name))
            `)
                        .eq('id', payload.new.id)
                        .single()

                    if (data) {
                        setMessages(prev => [...prev, data as any])
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'chat_messages',
                    filter: `family_id=eq.${activeFamilyId}`
                },
                (payload) => {
                    if (payload.new.is_deleted) {
                        setMessages(prev => prev.filter(m => m.id !== payload.new.id))
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

    // Send message
    async function sendMessage(e?: React.FormEvent) {
        e?.preventDefault()

        if (!newMessage.trim() || !activeFamilyId || !myMember || sending) return

        setSending(true)

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

        setSending(false)
    }

    // Handle file upload
    async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file || !activeFamilyId || !myMember) return

        setSending(true)

        // Determine media type
        let mediaType = 'file'
        if (file.type.startsWith('image/')) mediaType = 'image'
        else if (file.type.startsWith('video/')) mediaType = 'video'
        else if (file.type.startsWith('audio/')) mediaType = 'audio'

        // Upload to Supabase Storage
        const fileName = `${activeFamilyId}/${Date.now()}_${file.name}`
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('family-media')
            .upload(fileName, file)

        if (uploadError) {
            console.error('Upload error:', uploadError)
            setSending(false)
            return
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('family-media')
            .getPublicUrl(fileName)

        // Send message with media
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

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    // Handle keyboard shortcuts
    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage()
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
                <span className="chat-members">{members.size} miembros</span>
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
                                                <div className="message-reply">
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

                                            <span className="message-time">{formatTime(msg.created_at)}</span>
                                        </div>

                                        <button
                                            className="message-reply-btn"
                                            onClick={() => setReplyTo(msg)}
                                            title="Responder"
                                        >
                                            ↩
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Reply Preview */}
            {replyTo && (
                <div className="reply-preview">
                    <div className="reply-info">
                        <span className="reply-label">Respondiendo a {replyTo.sender?.display_name}</span>
                        <span className="reply-text">{replyTo.content?.slice(0, 50) || 'Media'}</span>
                    </div>
                    <button className="reply-cancel" onClick={() => setReplyTo(null)}>✕</button>
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

                <button
                    type="button"
                    className="chat-attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={sending}
                >
                    📎
                </button>

                <textarea
                    ref={inputRef}
                    className="chat-input"
                    placeholder="Escribe un mensaje..."
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
                    {sending ? '⏳' : '➤'}
                </button>
            </form>
        </div>
    )
}
