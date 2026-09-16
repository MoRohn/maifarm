//
//  MaiFarmLogo.swift
//  MaiFarm
//
//  MaiFarm Logo Components - Circuit Plant Design
//

import SwiftUI

// MARK: - MaiFarm Logo View (Circuit Plant Design)
struct MaiFarmLogoView: View {
    var size: CGFloat = 120
    var showGlow: Bool = true
    var animated: Bool = false
    var showText: Bool = false
    var lightBackground: Bool = false

    @State private var glowAmount: Double = 0

    var body: some View {
        HStack(spacing: size * 0.15) {
            // Circuit Plant Logo
            ZStack {
                // Glow effect for dark mode
                if showGlow && !lightBackground {
                    Circle()
                        .fill(MaiFarmColors.primaryGreen.opacity(0.2))
                        .frame(width: size * 1.2, height: size * 1.2)
                        .blur(radius: size * 0.2)
                        .scaleEffect(animated ? 1 + glowAmount * 0.1 : 1)
                }

                // Circuit Plant Shape
                CircuitPlantShape()
                    .stroke(lightBackground ? Color.black.opacity(0.85) : Color.white.opacity(0.9), lineWidth: size * 0.025)
                    .frame(width: size, height: size)

                // Green leaves overlay
                CircuitPlantLeaves()
                    .fill(MaiFarmColors.primaryGreen)
                    .frame(width: size, height: size)

                // Circuit connection dots
                CircuitDotsOverlay(size: size, lightBackground: lightBackground)
            }
            .frame(width: size, height: size)

            // Optional text branding
            if showText {
                HStack(spacing: 0) {
                    Text("Mai")
                        .font(.system(size: size * 0.35, weight: .bold, design: .rounded))
                        .foregroundColor(lightBackground ? .black : .white)
                    Text("Farm")
                        .font(.system(size: size * 0.35, weight: .bold, design: .rounded))
                        .foregroundColor(MaiFarmColors.primaryGreen)
                }
            }
        }
        .onAppear {
            if animated {
                withAnimation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true)) {
                    glowAmount = 1.0
                }
            }
        }
    }
}

// MARK: - Circuit Plant Shape (stem and circuit roots)
struct CircuitPlantShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let w = rect.width
        let h = rect.height
        let centerX = w * 0.5

        // Main vertical stem
        path.move(to: CGPoint(x: centerX, y: h * 0.35))
        path.addLine(to: CGPoint(x: centerX, y: h * 0.55))

        // Left circuit root - main branch
        path.move(to: CGPoint(x: centerX, y: h * 0.55))
        path.addLine(to: CGPoint(x: w * 0.25, y: h * 0.70))

        // Left circuit root - sub-branches
        path.move(to: CGPoint(x: w * 0.25, y: h * 0.70))
        path.addLine(to: CGPoint(x: w * 0.10, y: h * 0.70))

        path.move(to: CGPoint(x: w * 0.25, y: h * 0.70))
        path.addLine(to: CGPoint(x: w * 0.25, y: h * 0.85))

        path.move(to: CGPoint(x: w * 0.25, y: h * 0.85))
        path.addLine(to: CGPoint(x: w * 0.12, y: h * 0.85))

        // Right circuit root - main branch
        path.move(to: CGPoint(x: centerX, y: h * 0.55))
        path.addLine(to: CGPoint(x: w * 0.75, y: h * 0.70))

        // Right circuit root - sub-branches
        path.move(to: CGPoint(x: w * 0.75, y: h * 0.70))
        path.addLine(to: CGPoint(x: w * 0.90, y: h * 0.70))

        path.move(to: CGPoint(x: w * 0.75, y: h * 0.70))
        path.addLine(to: CGPoint(x: w * 0.75, y: h * 0.85))

        path.move(to: CGPoint(x: w * 0.75, y: h * 0.85))
        path.addLine(to: CGPoint(x: w * 0.88, y: h * 0.85))

        // Center root
        path.move(to: CGPoint(x: centerX, y: h * 0.55))
        path.addLine(to: CGPoint(x: centerX, y: h * 0.92))

        return path
    }
}

// MARK: - Circuit Plant Leaves (green filled)
struct CircuitPlantLeaves: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let w = rect.width
        let h = rect.height
        let centerX = w * 0.5

        // Left leaf
        path.move(to: CGPoint(x: centerX, y: h * 0.38))
        path.addQuadCurve(
            to: CGPoint(x: w * 0.18, y: h * 0.12),
            control: CGPoint(x: w * 0.22, y: h * 0.28)
        )
        path.addQuadCurve(
            to: CGPoint(x: centerX - w * 0.02, y: h * 0.32),
            control: CGPoint(x: w * 0.30, y: h * 0.15)
        )
        path.closeSubpath()

        // Right leaf
        path.move(to: CGPoint(x: centerX, y: h * 0.38))
        path.addQuadCurve(
            to: CGPoint(x: w * 0.82, y: h * 0.12),
            control: CGPoint(x: w * 0.78, y: h * 0.28)
        )
        path.addQuadCurve(
            to: CGPoint(x: centerX + w * 0.02, y: h * 0.32),
            control: CGPoint(x: w * 0.70, y: h * 0.15)
        )
        path.closeSubpath()

        return path
    }
}

// MARK: - Circuit Dots Overlay
struct CircuitDotsOverlay: View {
    let size: CGFloat
    var lightBackground: Bool = false

    var dotColor: Color {
        MaiFarmColors.primaryGreen
    }

    var body: some View {
        ZStack {
            let dotSize = size * 0.08

            // Main junction dot (center)
            Circle()
                .fill(dotColor)
                .frame(width: dotSize * 1.2, height: dotSize * 1.2)
                .offset(x: 0, y: size * 0.05)

            // Left branch dots
            Circle()
                .fill(dotColor)
                .frame(width: dotSize, height: dotSize)
                .offset(x: -size * 0.25, y: size * 0.20)

            Circle()
                .fill(dotColor)
                .frame(width: dotSize * 0.8, height: dotSize * 0.8)
                .offset(x: -size * 0.40, y: size * 0.20)

            Circle()
                .fill(dotColor)
                .frame(width: dotSize, height: dotSize)
                .offset(x: -size * 0.25, y: size * 0.35)

            Circle()
                .fill(dotColor)
                .frame(width: dotSize * 0.8, height: dotSize * 0.8)
                .offset(x: -size * 0.38, y: size * 0.35)

            // Right branch dots
            Circle()
                .fill(dotColor)
                .frame(width: dotSize, height: dotSize)
                .offset(x: size * 0.25, y: size * 0.20)

            Circle()
                .fill(dotColor)
                .frame(width: dotSize * 0.8, height: dotSize * 0.8)
                .offset(x: size * 0.40, y: size * 0.20)

            Circle()
                .fill(dotColor)
                .frame(width: dotSize, height: dotSize)
                .offset(x: size * 0.25, y: size * 0.35)

            Circle()
                .fill(dotColor)
                .frame(width: dotSize * 0.8, height: dotSize * 0.8)
                .offset(x: size * 0.38, y: size * 0.35)

            // Center bottom dot
            Circle()
                .fill(dotColor)
                .frame(width: dotSize, height: dotSize)
                .offset(x: 0, y: size * 0.42)
        }
    }
}

// MARK: - Simple Logo (for smaller contexts)
struct MaiFarmLogoSimple: View {
    var size: CGFloat = 40
    var lightBackground: Bool = false

    var body: some View {
        ZStack {
            // Circuit plant mini version
            CircuitPlantShape()
                .stroke(lightBackground ? Color.black.opacity(0.8) : Color.white.opacity(0.9), lineWidth: max(1.5, size * 0.02))
                .frame(width: size, height: size)

            CircuitPlantLeaves()
                .fill(MaiFarmColors.primaryGreen)
                .frame(width: size, height: size)

            // Simplified dots for small size
            Circle()
                .fill(MaiFarmColors.primaryGreen)
                .frame(width: size * 0.1, height: size * 0.1)
                .offset(y: size * 0.05)
        }
    }
}

// MARK: - App Logo Image View (uses actual app icon)
struct AppLogoImageView: View {
    var size: CGFloat = 40
    var showShadow: Bool = true

    var body: some View {
        Image("Logo")
            .resizable()
            .aspectRatio(contentMode: .fit)
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
            .shadow(color: MaiFarmColors.primaryGreen.opacity(showShadow ? 0.3 : 0), radius: size * 0.1, x: 0, y: size * 0.05)
    }
}

// MARK: - Header Logo View (for navigation bars)
struct HeaderLogoView: View {
    var body: some View {
        HStack(spacing: 8) {
            AppLogoImageView(size: 32, showShadow: false)
            Text("MaiFarm")
                .font(.headline)
                .fontWeight(.semibold)
                .foregroundColor(.primary)
        }
    }
}

// MARK: - Full Brand Logo with Text
struct MaiFarmBrandLogo: View {
    var logoSize: CGFloat = 80
    var fontSize: CGFloat = 32
    var lightBackground: Bool = false
    var animated: Bool = false

    var body: some View {
        HStack(spacing: logoSize * 0.2) {
            MaiFarmLogoSimple(size: logoSize, lightBackground: lightBackground)

            HStack(spacing: 0) {
                Text("Mai")
                    .font(.system(size: fontSize, weight: .bold, design: .rounded))
                    .foregroundColor(lightBackground ? .black : .white)
                Text("Farm")
                    .font(.system(size: fontSize, weight: .bold, design: .rounded))
                    .foregroundColor(MaiFarmColors.primaryGreen)
            }
        }
    }
}

// MARK: - Previews
#Preview("Logo View") {
    VStack(spacing: 40) {
        MaiFarmLogoView(size: 120, showGlow: true, animated: true)
        MaiFarmLogoSimple(size: 60)
        HeaderLogoView()
        MaiFarmBrandLogo()
    }
    .padding()
    .background(Color.black)
}

#Preview("Logo View - Light") {
    VStack(spacing: 40) {
        MaiFarmLogoView(size: 120, showGlow: false, lightBackground: true)
        MaiFarmLogoSimple(size: 60, lightBackground: true)
        MaiFarmBrandLogo(lightBackground: true)
    }
    .padding()
    .background(Color.white)
}
