// Utility functions for member display and formatting

export type MemberGender = 'man' | 'woman' | 'boy' | 'girl' | null

/**
 * Returns the appropriate emoji based on member gender
 */
export function getGenderEmoji(gender: MemberGender): string {
    switch (gender) {
        case 'man':
            return '👨'
        case 'woman':
            return '👩'
        case 'boy':
            return '👦'
        case 'girl':
            return '👧'
        default:
            return '👤'
    }
}

/**
 * Formats member display as "emoji name"
 */
export function formatMemberDisplay(name: string, gender: MemberGender): string {
    const emoji = getGenderEmoji(gender)
    return `${emoji} ${name}`
}

/**
 * Gets Spanish label for gender value
 */
export function getGenderLabel(gender: MemberGender): string {
    switch (gender) {
        case 'man':
            return 'Hombre'
        case 'woman':
            return 'Mujer'
        case 'boy':
            return 'Niño'
        case 'girl':
            return 'Niña'
        default:
            return 'Sin especificar'
    }
}
