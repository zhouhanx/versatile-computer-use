import AppKit
import Foundation

final class AxNode: NSAccessibilityElement {
    let labelText: String
    var childNodes: [NSAccessibilityElement] = []

    init(label: String) {
        self.labelText = label
        super.init()
        setAccessibilityRole(.group)
        setAccessibilityLabel(label)
        setAccessibilityElement(true)
    }

    override func accessibilityChildren() -> [Any]? {
        childNodes
    }
}

final class FixtureWindow: NSWindow {
    var fixtureChildren: [Any] = []

    override func accessibilityChildren() -> [Any]? {
        if fixtureChildren.isEmpty {
            return super.accessibilityChildren()
        }
        return fixtureChildren
    }
}

func chain(depth: Int) -> AxNode {
    let leaf = AxNode(label: "depth-target")
    var current = leaf
    if depth <= 1 {
        return current
    }
    for index in stride(from: depth - 2, through: 0, by: -1) {
        let parent = AxNode(label: "depth-\(index)")
        current.setAccessibilityParent(parent)
        parent.childNodes = [current]
        current = parent
    }
    return current
}

func siblingBox(count: Int) -> AxNode {
    let box = AxNode(label: "sibling-box")
    var kids: [NSAccessibilityElement] = []
    for index in 0..<count {
        let kid = AxNode(label: "sib-\(index)")
        kid.setAccessibilityParent(box)
        kids.append(kid)
    }
    box.childNodes = kids
    return box
}

func makeWindow(title: String, children: [Any]) -> FixtureWindow {
    let window = FixtureWindow(
        contentRect: NSRect(x: 120, y: 120, width: 640, height: 420),
        styleMask: [.titled, .closable, .miniaturizable],
        backing: .buffered,
        defer: false
    )
    window.title = title
    window.isReleasedWhenClosed = false
    window.fixtureChildren = children
    for child in children {
        if let element = child as? NSAccessibilityElement {
            element.setAccessibilityParent(window)
        }
    }
    window.makeKeyAndOrderFront(nil)
    return window
}

final class FixtureDelegate: NSObject, NSApplicationDelegate {
    var windows: [NSWindow] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        let depth = chain(depth: 16)
        let siblings = siblingBox(count: 40)
        let secret = NSSecureTextField(frame: NSRect(x: 20, y: 20, width: 220, height: 24))
        secret.stringValue = "vcu-secret-should-not-leak"
        secret.placeholderString = "Password"
        let abnormal = AxNode(label: "abnormal-node")
        let broken = NSAccessibilityElement()
        broken.setAccessibilityParent(abnormal)
        abnormal.childNodes = [broken]
        let other = AxNode(label: "other-window-marker")
        let primary = makeWindow(title: "VCU-MAC-002-FIXTURE", children: [depth, siblings, secret, abnormal])
        let secondary = makeWindow(title: "VCU-MAC-002-OTHER", children: [other])
        secondary.setFrame(NSRect(x: 800, y: 160, width: 480, height: 300), display: true)
        windows = [primary, secondary]
        NSApp.activate(ignoringOtherApps: true)
        let ready: [String: Any] = [
            "pid": Int(getpid()),
            "title": "VCU-MAC-002-FIXTURE",
            "other_title": "VCU-MAC-002-OTHER",
            "depth": 16,
            "siblings": 40,
        ]
        let data = try! JSONSerialization.data(withJSONObject: ready)
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([0x0A]))
        fflush(stdout)
    }
}

let app = NSApplication.shared
let delegate = FixtureDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
