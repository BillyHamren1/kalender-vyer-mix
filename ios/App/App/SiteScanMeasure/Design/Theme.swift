import SwiftUI

/// Minimal design tokens needed by MeasureScreen and its subviews.
/// Self-contained — does not depend on the rest of the SiteScan design system.
enum Theme {
    enum Spacing {
        static let xxs: CGFloat = 2
        static let xs:  CGFloat = 4
        static let sm:  CGFloat = 8
        static let md:  CGFloat = 12
        static let lg:  CGFloat = 16
        static let xl:  CGFloat = 24
    }
    enum Radius {
        static let sm: CGFloat = 6
        static let md: CGFloat = 10
        static let lg: CGFloat = 14
        static let xl: CGFloat = 20
    }
}

extension Color {
    static let surfaceSecondary = Color(.secondarySystemGroupedBackground)
}
