import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useActiveFamily } from '../lib/useActiveFamily'
import './Rewards.css'

type PointRecord = {
    id: string
    points: number
    reason: string
    created_at: string
    created_by_member: { display_name: string } | null
}

type Goal = {
    id: string
    title: string
    description: string | null
    points: number
    icon: string
    is_recurring: boolean
    is_active: boolean
}

type RewardItem = {
    id: string
    title: string
    description: string | null
    points_cost: number
    icon: string
    stock: number | null
    is_active: boolean
}

type Redemption = {
    id: string
    points_spent: number
    status: string
    created_at: string
    reward_item: { title: string; icon: string } | null
}

type FeedPost = {
    id: string
    content: string | null
    media_urls: string[] | null
    created_at: string
    author_member: { display_name: string; avatar_url: string | null } | null
    reactions: { emoji: string; member_id: string }[]
}

type Member = {
    id: string
    display_name: string
    avatar_url: string | null
}

export default function RewardsPage() {
    const { activeFamilyId, myMember } = useActiveFamily()
    const [activeTab, setActiveTab] = useState<'points' | 'goals' | 'rewards' | 'feed'>('points')

    // Data states
    const [points, setPoints] = useState<PointRecord[]>([])
    const [balance, setBalance] = useState(0)
    const [goals, setGoals] = useState<Goal[]>([])
    const [rewardItems, setRewardItems] = useState<RewardItem[]>([])
    const [redemptions, setRedemptions] = useState<Redemption[]>([])
    const [feed, setFeed] = useState<FeedPost[]>([])
    const [members, setMembers] = useState<Member[]>([])
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

    const [loading, setLoading] = useState(true)

    const isAdult = myMember?.role === 'owner' || myMember?.role === 'admin' || myMember?.role === 'adult'
    const viewingMemberId = selectedMemberId || myMember?.id

    // Load data
    const loadData = useCallback(async () => {
        if (!activeFamilyId) return
        setLoading(true)

        try {
            // Load members
            const { data: membersData } = await supabase
                .from('members')
                .select('id, display_name, avatar_url')
                .eq('family_id', activeFamilyId)
            if (membersData) setMembers(membersData)

            // Load points for selected member
            if (viewingMemberId) {
                const { data: pointsData } = await supabase
                    .from('reward_points')
                    .select('id, points, reason, created_at, created_by_member:created_by_member_id(display_name)')
                    .eq('family_id', activeFamilyId)
                    .eq('member_id', viewingMemberId)
                    .order('created_at', { ascending: false })
                    .limit(50)
                if (pointsData) setPoints(pointsData as any)

                // Calculate balance
                const { data: balanceData } = await supabase.rpc('get_member_points_balance', {
                    _family_id: activeFamilyId,
                    _member_id: viewingMemberId
                })
                if (balanceData !== null) setBalance(balanceData)
            }

            // Load goals
            const { data: goalsData } = await supabase
                .from('reward_goals')
                .select('*')
                .eq('family_id', activeFamilyId)
                .eq('is_active', true)
                .order('title')
            if (goalsData) setGoals(goalsData)

            // Load reward items
            const { data: itemsData } = await supabase
                .from('reward_items')
                .select('*')
                .eq('family_id', activeFamilyId)
                .eq('is_active', true)
                .order('points_cost')
            if (itemsData) setRewardItems(itemsData)

            // Load redemptions
            if (viewingMemberId) {
                const { data: redemptionsData } = await supabase
                    .from('reward_redemptions')
                    .select('id, points_spent, status, created_at, reward_item:reward_item_id(title, icon)')
                    .eq('family_id', activeFamilyId)
                    .eq('member_id', viewingMemberId)
                    .order('created_at', { ascending: false })
                    .limit(20)
                if (redemptionsData) setRedemptions(redemptionsData as any)
            }

            // Load feed
            const { data: feedData } = await supabase
                .from('family_feed')
                .select(`
          id, content, media_urls, created_at, is_pinned,
          author_member:author_member_id(display_name, avatar_url),
          reactions:feed_reactions(emoji, member_id)
        `)
                .eq('family_id', activeFamilyId)
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(30)
            if (feedData) setFeed(feedData as any)

        } catch (err) {
            console.error('Error loading rewards data:', err)
        } finally {
            setLoading(false)
        }
    }, [activeFamilyId, viewingMemberId])

    useEffect(() => {
        loadData()
    }, [loadData])

    // Complete a goal (add points)
    async function completeGoal(goal: Goal) {
        if (!activeFamilyId || !viewingMemberId) return

        const { error } = await supabase.from('reward_points').insert({
            family_id: activeFamilyId,
            member_id: viewingMemberId,
            points: goal.points,
            reason: `Completado: ${goal.title}`,
            goal_id: goal.id,
            created_by_member_id: myMember?.id
        })

        if (!error) {
            // Create feed post
            await supabase.from('family_feed').insert({
                family_id: activeFamilyId,
                author_member_id: viewingMemberId,
                content: `🎉 ¡Completó "${goal.title}" y ganó ${goal.points} puntos!`,
                related_goal_id: goal.id
            })
            loadData()
        }
    }

    // Redeem a reward
    async function redeemReward(item: RewardItem) {
        if (!activeFamilyId || !viewingMemberId) return
        if (balance < item.points_cost) {
            alert('No tienes suficientes puntos')
            return
        }

        // Deduct points
        const { error: pointsError } = await supabase.from('reward_points').insert({
            family_id: activeFamilyId,
            member_id: viewingMemberId,
            points: -item.points_cost,
            reason: `Canje: ${item.title}`,
            created_by_member_id: myMember?.id
        })

        if (pointsError) return

        // Create redemption
        const { error: redeemError } = await supabase.from('reward_redemptions').insert({
            family_id: activeFamilyId,
            member_id: viewingMemberId,
            reward_item_id: item.id,
            points_spent: item.points_cost,
            status: 'pending'
        })

        if (!redeemError) {
            await supabase.from('family_feed').insert({
                family_id: activeFamilyId,
                author_member_id: viewingMemberId,
                content: `🎁 ¡Canjeó "${item.title}" por ${item.points_cost} puntos!`
            })
            loadData()
        }
    }

    // Approve redemption
    async function approveRedemption(redemption: Redemption, status: 'approved' | 'rejected') {
        const { error } = await supabase
            .from('reward_redemptions')
            .update({
                status,
                approved_by_member_id: myMember?.id,
                approved_at: new Date().toISOString()
            })
            .eq('id', redemption.id)

        if (!error) loadData()
    }

    // Add reaction to feed post
    async function toggleReaction(post: FeedPost, emoji: string) {
        if (!myMember) return

        const existingReaction = post.reactions.find(r => r.member_id === myMember.id)

        if (existingReaction) {
            await supabase.from('feed_reactions').delete().eq('feed_id', post.id).eq('member_id', myMember.id)
        } else {
            await supabase.from('feed_reactions').insert({
                feed_id: post.id,
                member_id: myMember.id,
                emoji
            })
        }
        loadData()
    }

    function formatDate(iso: string) {
        const date = new Date(iso)
        const now = new Date()
        const diff = now.getTime() - date.getTime()

        if (diff < 60000) return 'Ahora'
        if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`
        if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)} h`
        return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    }

    if (loading) {
        return (
            <div className="page rewards-page">
                <div className="loading-spinner">Cargando...</div>
            </div>
        )
    }

    return (
        <div className="page rewards-page">
            {/* Balance Header */}
            <div className="rewards-header">
                <div className="balance-card">
                    <span className="balance-icon">⭐</span>
                    <div className="balance-info">
                        <span className="balance-label">Mi Balance</span>
                        <span className="balance-value">{balance} puntos</span>
                    </div>
                </div>

                {isAdult && (
                    <select
                        className="member-selector"
                        value={selectedMemberId || ''}
                        onChange={(e) => setSelectedMemberId(e.target.value || null)}
                    >
                        <option value="">Mi vista</option>
                        {members.map(m => (
                            <option key={m.id} value={m.id}>{m.display_name}</option>
                        ))}
                    </select>
                )}
            </div>

            {/* Tabs */}
            <div className="rewards-tabs">
                {[
                    { id: 'points', label: 'Puntos', icon: '⭐' },
                    { id: 'goals', label: 'Metas', icon: '🎯' },
                    { id: 'rewards', label: 'Premios', icon: '🎁' },
                    { id: 'feed', label: 'Feed', icon: '📣' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        className={`rewards-tab ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id as any)}
                    >
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="rewards-content">
                {/* Points Tab */}
                {activeTab === 'points' && (
                    <div className="points-section">
                        <h3>📊 Historial de Puntos</h3>
                        {points.length === 0 ? (
                            <p className="empty-state">No hay puntos registrados aún</p>
                        ) : (
                            <div className="points-list">
                                {points.map(p => (
                                    <div key={p.id} className={`point-card ${p.points >= 0 ? 'positive' : 'negative'}`}>
                                        <div className="point-amount">{p.points >= 0 ? '+' : ''}{p.points}</div>
                                        <div className="point-info">
                                            <div className="point-reason">{p.reason}</div>
                                            <div className="point-meta">
                                                {formatDate(p.created_at)}
                                                {p.created_by_member && ` • por ${p.created_by_member.display_name}`}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Goals Tab */}
                {activeTab === 'goals' && (
                    <div className="goals-section">
                        <h3>🎯 Metas Activas</h3>
                        {goals.length === 0 ? (
                            <p className="empty-state">No hay metas definidas. {isAdult && 'Usa "+ Añadir" para crear una.'}</p>
                        ) : (
                            <div className="goals-grid">
                                {goals.map(g => (
                                    <div key={g.id} className="goal-card">
                                        <span className="goal-icon">{g.icon}</span>
                                        <div className="goal-info">
                                            <div className="goal-title">{g.title}</div>
                                            {g.description && <div className="goal-desc">{g.description}</div>}
                                            <div className="goal-points">+{g.points} puntos</div>
                                        </div>
                                        <button
                                            className="btn-complete"
                                            onClick={() => completeGoal(g)}
                                        >
                                            ✓ Hecho
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Rewards Tab */}
                {activeTab === 'rewards' && (
                    <div className="rewards-section">
                        <h3>🎁 Premios Canjeables</h3>
                        {rewardItems.length === 0 ? (
                            <p className="empty-state">No hay premios disponibles. {isAdult && 'Usa "+ Añadir" para crear uno.'}</p>
                        ) : (
                            <div className="rewards-grid">
                                {rewardItems.map(item => (
                                    <div key={item.id} className={`reward-item-card ${balance >= item.points_cost ? 'available' : 'locked'}`}>
                                        <span className="reward-icon">{item.icon}</span>
                                        <div className="reward-info">
                                            <div className="reward-title">{item.title}</div>
                                            {item.description && <div className="reward-desc">{item.description}</div>}
                                            <div className="reward-cost">{item.points_cost} puntos</div>
                                        </div>
                                        <button
                                            className="btn-redeem"
                                            disabled={balance < item.points_cost}
                                            onClick={() => redeemReward(item)}
                                        >
                                            🎁 Canjear
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Pending Redemptions */}
                        {redemptions.filter(r => r.status === 'pending').length > 0 && (
                            <>
                                <h3>⏳ Canjes Pendientes</h3>
                                <div className="redemptions-list">
                                    {redemptions.filter(r => r.status === 'pending').map(r => (
                                        <div key={r.id} className="redemption-card pending">
                                            <span className="redemption-icon">{r.reward_item?.icon || '🎁'}</span>
                                            <div className="redemption-info">
                                                <div className="redemption-title">{r.reward_item?.title}</div>
                                                <div className="redemption-meta">{formatDate(r.created_at)}</div>
                                            </div>
                                            {isAdult && (
                                                <div className="redemption-actions">
                                                    <button className="btn-approve" onClick={() => approveRedemption(r, 'approved')}>✓</button>
                                                    <button className="btn-reject" onClick={() => approveRedemption(r, 'rejected')}>✕</button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* Feed Tab */}
                {activeTab === 'feed' && (
                    <div className="feed-section">
                        <h3>📣 Feed Familiar</h3>
                        {feed.length === 0 ? (
                            <p className="empty-state">No hay publicaciones aún</p>
                        ) : (
                            <div className="feed-list">
                                {feed.map(post => (
                                    <div key={post.id} className="feed-post">
                                        <div className="feed-author">
                                            <div className="feed-avatar">
                                                {post.author_member?.avatar_url ? (
                                                    <img src={post.author_member.avatar_url} alt="" />
                                                ) : (
                                                    '👤'
                                                )}
                                            </div>
                                            <div className="feed-author-info">
                                                <span className="feed-author-name">{post.author_member?.display_name || 'Familia'}</span>
                                                <span className="feed-time">{formatDate(post.created_at)}</span>
                                            </div>
                                        </div>

                                        {post.content && <p className="feed-content">{post.content}</p>}

                                        {post.media_urls && post.media_urls.length > 0 && (
                                            <div className="feed-media">
                                                {post.media_urls.map((url, i) => (
                                                    <img key={i} src={url} alt="" className="feed-image" />
                                                ))}
                                            </div>
                                        )}

                                        <div className="feed-reactions">
                                            {['❤️', '👏', '🎉', '⭐'].map(emoji => {
                                                const count = post.reactions.filter(r => r.emoji === emoji).length
                                                const myReaction = post.reactions.find(r => r.member_id === myMember?.id && r.emoji === emoji)
                                                return (
                                                    <button
                                                        key={emoji}
                                                        className={`reaction-btn ${myReaction ? 'active' : ''}`}
                                                        onClick={() => toggleReaction(post, emoji)}
                                                    >
                                                        {emoji} {count > 0 && <span className="reaction-count">{count}</span>}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
