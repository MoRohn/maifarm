//
//  Colors.swift
//  MaiFarm
//
//  MaiFarm Brand Colors - Design System Foundation
//  Synced with web dashboard theme system (apps/dashboard/src/types/theme.ts)
//

import SwiftUI

// MARK: - Color Scheme Definition
/// Represents a complete color scheme matching the web dashboard
struct MaiFarmColorScheme: Identifiable {
    let id: String
    let name: String
    let primary: Color
    let primaryDark: Color
    let primaryLight: Color
    let accent: Color
    let accentDark: Color
    let accentLight: Color

    // RGB values for gradient overlays
    let primaryRGB: (Double, Double, Double)
    let accentRGB: (Double, Double, Double)
}

// Manual Equatable conformance since tuples don't auto-conform
extension MaiFarmColorScheme: Equatable {
    static func == (lhs: MaiFarmColorScheme, rhs: MaiFarmColorScheme) -> Bool {
        lhs.id == rhs.id
    }
}

// Computed properties for gradients
extension MaiFarmColorScheme {
    var gradient: LinearGradient {
        LinearGradient(
            colors: [primary, accent],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    var subtleGradient: LinearGradient {
        LinearGradient(
            colors: [primary.opacity(0.15), accent.opacity(0.08)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

// MARK: - All Color Schemes (synced with web)
struct MaiFarmColorSchemes {
    /// Forest Walk - Default green theme (matches web default)
    static let forestWalk = MaiFarmColorScheme(
        id: "forest-walk",
        name: "Forest Walk",
        primary: Color(red: 0.063, green: 0.725, blue: 0.506),      // #10B981
        primaryDark: Color(red: 0.020, green: 0.588, blue: 0.412),  // #059669
        primaryLight: Color(red: 0.204, green: 0.827, blue: 0.600), // #34D399
        accent: Color(red: 0.518, green: 0.800, blue: 0.086),       // #84CC16
        accentDark: Color(red: 0.396, green: 0.639, blue: 0.051),   // #65A30D
        accentLight: Color(red: 0.639, green: 0.902, blue: 0.212),  // #A3E635
        primaryRGB: (16, 185, 129),
        accentRGB: (132, 204, 22)
    )

    /// Purple Dreams - Purple and pink theme
    static let purpleDreams = MaiFarmColorScheme(
        id: "purple-dreams",
        name: "Purple Dreams",
        primary: Color(red: 0.545, green: 0.361, blue: 0.965),      // #8B5CF6
        primaryDark: Color(red: 0.486, green: 0.227, blue: 0.929),  // #7C3AED
        primaryLight: Color(red: 0.655, green: 0.545, blue: 0.980), // #A78BFA
        accent: Color(red: 0.925, green: 0.282, blue: 0.600),       // #EC4899
        accentDark: Color(red: 0.859, green: 0.153, blue: 0.467),   // #DB2777
        accentLight: Color(red: 0.976, green: 0.659, blue: 0.831),  // #F9A8D4
        primaryRGB: (139, 92, 246),
        accentRGB: (236, 72, 153)
    )

    /// Ocean Breeze - Cyan and teal theme
    static let oceanBreeze = MaiFarmColorScheme(
        id: "ocean-breeze",
        name: "Ocean Breeze",
        primary: Color(red: 0.055, green: 0.647, blue: 0.914),      // #0EA5E9
        primaryDark: Color(red: 0.008, green: 0.518, blue: 0.780),  // #0284C7
        primaryLight: Color(red: 0.220, green: 0.741, blue: 0.973), // #38BDF8
        accent: Color(red: 0.078, green: 0.722, blue: 0.651),       // #14B8A6
        accentDark: Color(red: 0.051, green: 0.580, blue: 0.533),   // #0D9488
        accentLight: Color(red: 0.180, green: 0.831, blue: 0.749),  // #2DD4BF
        primaryRGB: (14, 165, 233),
        accentRGB: (20, 184, 166)
    )

    /// Sunset Glow - Orange and amber theme
    static let sunsetGlow = MaiFarmColorScheme(
        id: "sunset-glow",
        name: "Sunset Glow",
        primary: Color(red: 0.976, green: 0.451, blue: 0.086),      // #F97316
        primaryDark: Color(red: 0.918, green: 0.345, blue: 0.047),  // #EA580C
        primaryLight: Color(red: 0.984, green: 0.573, blue: 0.235), // #FB923C
        accent: Color(red: 0.961, green: 0.620, blue: 0.043),       // #F59E0B
        accentDark: Color(red: 0.851, green: 0.467, blue: 0.024),   // #D97706
        accentLight: Color(red: 0.988, green: 0.827, blue: 0.302),  // #FCD34D
        primaryRGB: (249, 115, 22),
        accentRGB: (245, 158, 11)
    )

    /// Cherry Blossom - Pink theme
    static let cherryBlossom = MaiFarmColorScheme(
        id: "cherry-blossom",
        name: "Cherry Blossom",
        primary: Color(red: 0.925, green: 0.282, blue: 0.600),      // #EC4899
        primaryDark: Color(red: 0.859, green: 0.153, blue: 0.467),  // #DB2777
        primaryLight: Color(red: 0.976, green: 0.659, blue: 0.831), // #F9A8D4
        accent: Color(red: 0.957, green: 0.447, blue: 0.714),       // #F472B6
        accentDark: Color(red: 0.925, green: 0.282, blue: 0.600),   // #EC4899
        accentLight: Color(red: 0.984, green: 0.812, blue: 0.910),  // #FBCFE8
        primaryRGB: (236, 72, 153),
        accentRGB: (244, 114, 182)
    )

    /// Midnight Blue - Blue and indigo theme
    static let midnightBlue = MaiFarmColorScheme(
        id: "midnight-blue",
        name: "Midnight Blue",
        primary: Color(red: 0.231, green: 0.510, blue: 0.965),      // #3B82F6
        primaryDark: Color(red: 0.145, green: 0.388, blue: 0.922),  // #2563EB
        primaryLight: Color(red: 0.376, green: 0.647, blue: 0.980), // #60A5FA
        accent: Color(red: 0.388, green: 0.400, blue: 0.945),       // #6366F1
        accentDark: Color(red: 0.310, green: 0.275, blue: 0.898),   // #4F46E5
        accentLight: Color(red: 0.506, green: 0.549, blue: 0.973),  // #818CF8
        primaryRGB: (59, 130, 246),
        accentRGB: (99, 102, 241)
    )

    /// Autumn Harvest - Red and orange theme
    static let autumnHarvest = MaiFarmColorScheme(
        id: "autumn-harvest",
        name: "Autumn Harvest",
        primary: Color(red: 0.863, green: 0.149, blue: 0.149),      // #DC2626
        primaryDark: Color(red: 0.725, green: 0.110, blue: 0.110),  // #B91C1C
        primaryLight: Color(red: 0.937, green: 0.267, blue: 0.267), // #EF4444
        accent: Color(red: 0.918, green: 0.345, blue: 0.047),       // #EA580C
        accentDark: Color(red: 0.761, green: 0.255, blue: 0.047),   // #C2410C
        accentLight: Color(red: 0.976, green: 0.451, blue: 0.086),  // #F97316
        primaryRGB: (220, 38, 38),
        accentRGB: (234, 88, 12)
    )

    /// Cosmic Purple - Deep purple theme
    static let cosmicPurple = MaiFarmColorScheme(
        id: "cosmic-purple",
        name: "Cosmic Purple",
        primary: Color(red: 0.576, green: 0.200, blue: 0.918),      // #9333EA
        primaryDark: Color(red: 0.494, green: 0.133, blue: 0.808),  // #7E22CE
        primaryLight: Color(red: 0.659, green: 0.333, blue: 0.969), // #A855F7
        accent: Color(red: 0.659, green: 0.333, blue: 0.969),       // #A855F7
        accentDark: Color(red: 0.576, green: 0.200, blue: 0.918),   // #9333EA
        accentLight: Color(red: 0.753, green: 0.518, blue: 0.988),  // #C084FC
        primaryRGB: (147, 51, 234),
        accentRGB: (168, 85, 247)
    )

    /// All available color schemes
    static let all: [MaiFarmColorScheme] = [
        forestWalk,
        purpleDreams,
        oceanBreeze,
        sunsetGlow,
        cherryBlossom,
        midnightBlue,
        autumnHarvest,
        cosmicPurple
    ]

    /// Find scheme by ID
    static func scheme(for id: String) -> MaiFarmColorScheme {
        all.first { $0.id == id } ?? forestWalk
    }
}

// MARK: - Theme Manager
/// Manages the current theme selection and provides dynamic colors
final class MaiFarmThemeManager: ObservableObject, @unchecked Sendable {
    static let shared = MaiFarmThemeManager()

    @AppStorage("selectedColorScheme") private var selectedSchemeId: String = "forest-walk"

    @Published var currentScheme: MaiFarmColorScheme

    private init() {
        // Initialize with stored scheme
        let storedId = UserDefaults.standard.string(forKey: "selectedColorScheme") ?? "forest-walk"
        self.currentScheme = MaiFarmColorSchemes.scheme(for: storedId)
    }

    func setColorScheme(_ scheme: MaiFarmColorScheme) {
        currentScheme = scheme
        selectedSchemeId = scheme.id
    }

    func setColorScheme(id: String) {
        let scheme = MaiFarmColorSchemes.scheme(for: id)
        setColorScheme(scheme)
    }
}

// MARK: - MaiFarm Brand Colors (Legacy + Dynamic Support)
struct MaiFarmColors {
    // Dynamic colors based on current theme
    static var primary: Color {
        MaiFarmThemeManager.shared.currentScheme.primary
    }

    static var primaryDark: Color {
        MaiFarmThemeManager.shared.currentScheme.primaryDark
    }

    static var primaryLight: Color {
        MaiFarmThemeManager.shared.currentScheme.primaryLight
    }

    static var accent: Color {
        MaiFarmThemeManager.shared.currentScheme.accent
    }

    static var accentDark: Color {
        MaiFarmThemeManager.shared.currentScheme.accentDark
    }

    static var accentLight: Color {
        MaiFarmThemeManager.shared.currentScheme.accentLight
    }

    // Legacy support - maps to dynamic colors
    static var primaryGreen: Color { primary }
    static var accentGreen: Color { accent }
    static var lightGreen: Color { primaryLight }

    // Dark background (consistent across themes - matches web #0a0a0a)
    static let darkBackground = Color(red: 0.039, green: 0.039, blue: 0.039)

    // Adaptive colors (automatically switch with system color scheme)
    static var adaptiveBackground: Color {
        Color(.systemBackground)
    }

    static var adaptiveSecondaryBackground: Color {
        Color(.secondarySystemBackground)
    }

    static var adaptiveTertiaryBackground: Color {
        Color(.tertiarySystemBackground)
    }

    static var adaptiveGroupedBackground: Color {
        Color(.systemGroupedBackground)
    }

    static var adaptiveLabel: Color {
        Color(.label)
    }

    static var adaptiveSecondaryLabel: Color {
        Color(.secondaryLabel)
    }

    // Dynamic gradient based on current theme
    static var gradient: LinearGradient {
        MaiFarmThemeManager.shared.currentScheme.gradient
    }

    static var subtleGradient: LinearGradient {
        MaiFarmThemeManager.shared.currentScheme.subtleGradient
    }

    // Semantic colors (consistent across themes)
    static var success: Color { Color(red: 0.063, green: 0.725, blue: 0.506) } // #10B981
    static var warning: Color { Color(red: 0.961, green: 0.620, blue: 0.043) } // #F59E0B
    static var error: Color { Color(red: 0.937, green: 0.267, blue: 0.267) }   // #EF4444
    static var info: Color { Color(red: 0.231, green: 0.510, blue: 0.965) }    // #3B82F6
}

// MARK: - Color Extensions
extension Color {
    static var maiFarmPrimary: Color { MaiFarmColors.primary }
    static var maiFarmAccent: Color { MaiFarmColors.accent }
    static var maiFarmLight: Color { MaiFarmColors.primaryLight }

    /// Initialize from hex string
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - Environment Key for Theme
private struct ThemeEnvironmentKey: EnvironmentKey {
    static let defaultValue: MaiFarmColorScheme = MaiFarmColorSchemes.forestWalk
}

extension EnvironmentValues {
    var maiFarmTheme: MaiFarmColorScheme {
        get { self[ThemeEnvironmentKey.self] }
        set { self[ThemeEnvironmentKey.self] = newValue }
    }
}
