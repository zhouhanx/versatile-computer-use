import AppKit
import ApplicationServices
import Foundation

final class MarkedButton: NSButton {
    let mark: String
    let countsPresses: Bool
    var hangsNextPress = false
    var slowsNextPress = false
    var edgesNextPress = false
    var presses = 0

    init(mark: String, frame: NSRect, title: String = "Go", countsPresses: Bool = true) {
        self.mark = mark
        self.countsPresses = countsPresses
        super.init(frame: frame)
        self.title = title
        bezelStyle = .rounded
        setButtonType(.momentaryPushIn)
        identifier = NSUserInterfaceItemIdentifier(mark)
        if countsPresses {
            target = self
            action = #selector(notePress)
        }
        setAccessibilityElement(true)
        setAccessibilityIdentifier(mark)
        setAccessibilityLabel(title)
        setAccessibilityTitle(title)
        publishPressState()
    }

    required init?(coder: NSCoder) { nil }

    override func accessibilityIdentifier() -> String { mark }

    override func accessibilityHelp() -> String? { "presses=\(presses)" }

    override func accessibilityValue() -> Any? { "presses=\(presses)" }

    private var lastPress = Date.distantPast

    func publishPressState() {
        let state = "presses=\(presses)"
        setAccessibilityHelp(state)
        setAccessibilityValue(state)
    }

    @objc func notePress() {
        guard countsPresses else { return }
        let now = Date()
        if now.timeIntervalSince(lastPress) < 0.05 { return }
        lastPress = now
        presses += 1
        publishPressState()
    }

    func armHang() {
        hangsNextPress = true
        slowsNextPress = false
        edgesNextPress = false
    }

    func armSlow() {
        slowsNextPress = true
        hangsNextPress = false
        edgesNextPress = false
    }

    func armEdge() {
        edgesNextPress = true
        hangsNextPress = false
        slowsNextPress = false
    }

    override func accessibilityPerformPress() -> Bool {
        if hangsNextPress {
            hangsNextPress = false
            slowsNextPress = false
            // System Events abandons AXPress after about 1.6s and returns success.
            // Stay past that abandon, then return so the next read is not blocked.
            // A slow return is a hang only when AXHelp/AXValue did not change.
            Thread.sleep(forTimeInterval: 1.7)
            return false
        }
        if edgesNextPress {
            edgesNextPress = false
            Thread.sleep(forTimeInterval: 1.5)
            guard countsPresses else { return false }
            notePress()
            return true
        }
        if slowsNextPress {
            slowsNextPress = false
            Thread.sleep(forTimeInterval: 1.2)
            guard countsPresses else { return false }
            notePress()
            return true
        }
        guard countsPresses else { return false }
        notePress()
        return true
    }
}

final class MarkedScroller: NSScroller {
    weak var owner: MarkedScroll?
    private var syncing = false

    override var doubleValue: Double {
        didSet {
            guard !syncing, abs(doubleValue - oldValue) > 0.0001 else { return }
            owner?.applyFraction(doubleValue)
        }
    }

    override func setAccessibilityValue(_ accessibilityValue: Any?) {
        super.setAccessibilityValue(accessibilityValue)
        guard !syncing else { return }
        let fraction: Double?
        if let number = accessibilityValue as? NSNumber {
            fraction = number.doubleValue
        } else if let text = accessibilityValue as? String {
            fraction = Double(text)
        } else {
            fraction = nil
        }
        if let fraction {
            owner?.applyFraction(fraction)
        }
    }

    func assign(_ value: Double) {
        syncing = true
        doubleValue = min(1, max(0, value))
        syncing = false
    }
}

final class MarkedScroll: NSScrollView {
    let mark: String
    var offset = 0
    private var bar: MarkedScroller?
    private var applying = false

    init(mark: String, frame: NSRect) {
        self.mark = mark
        super.init(frame: frame)
        hasVerticalScroller = true
        hasHorizontalScroller = false
        autohidesScrollers = false
        borderType = .bezelBorder
        drawsBackground = true
        identifier = NSUserInterfaceItemIdentifier(mark)
        let document = NSTextView(frame: NSRect(x: 0, y: 0, width: max(40, frame.width - 20), height: 900))
        document.string = Array(repeating: "\(mark) line", count: 40).joined(separator: "\n")
        document.isEditable = false
        document.isSelectable = false
        documentView = document
        let scroller = MarkedScroller(frame: .zero)
        scroller.owner = self
        scroller.scrollerStyle = .legacy
        verticalScroller = scroller
        bar = scroller
        setAccessibilityElement(true)
        setAccessibilityRole(.scrollArea)
        setAccessibilityIdentifier(mark)
        setAccessibilityLabel(mark)
        publish()
    }

    required init?(coder: NSCoder) { nil }

    func publish() {
        let y = Int(contentView.bounds.origin.y.rounded())
        offset = max(0, y)
        let state = "offset=\(offset)"
        setAccessibilityHelp(state)
        setAccessibilityValue(state)
        setAccessibilityLabel(mark)
    }

    func applyFraction(_ fraction: Double) {
        guard !applying else { return }
        applying = true
        defer { applying = false }
        let clamped = min(1, max(0, fraction))
        bar?.assign(clamped)
        let docHeight = documentView?.bounds.height ?? 0
        let visible = contentView.bounds.height
        let maxY = max(0, docHeight - visible)
        contentView.scroll(to: NSPoint(x: 0, y: CGFloat(clamped) * maxY))
        reflectScrolledClipView(contentView)
        publish()
    }

    override func reflectScrolledClipView(_ clipView: NSClipView) {
        super.reflectScrolledClipView(clipView)
        publish()
    }

    override func scrollWheel(with event: NSEvent) {
        super.scrollWheel(with: event)
        publish()
    }

    override func accessibilityPerformAction(_ action: NSAccessibility.Action) {
        let name = action.rawValue.lowercased()
        if name.contains("down") {
            applyFraction((bar?.doubleValue ?? verticalScroller?.doubleValue ?? 0) + 0.2)
            return
        }
        if name.contains("up") {
            applyFraction((bar?.doubleValue ?? verticalScroller?.doubleValue ?? 0) - 0.2)
            return
        }
        super.accessibilityPerformAction(action)
    }


}

final class FixtureDelegate: NSObject, NSApplicationDelegate {
    var windows: [String: NSWindow] = [:]
    var buttons: [String: MarkedButton] = [:]
    var scrolls: [String: MarkedScroll] = [:]
    let titles = ["a": "VCU-MAC-003-A", "b": "VCU-MAC-003-B"]

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let appItem = NSMenuItem()
        menu.addItem(appItem)
        NSApp.mainMenu = menu
        DispatchQueue.main.async { [weak self] in
            self?.rebuild()
            self?.windows.values.forEach { window in
                window.level = .normal
                window.orderFrontRegardless()
            }
            self?.emitReady()
        }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            while let line = readLine() {
                let cmd = line.trimmingCharacters(in: .whitespacesAndNewlines)
                if cmd.isEmpty { continue }
                DispatchQueue.main.async {
                    self?.handle(cmd)
                }
            }
        }
    }

    func rebuild() {
        for window in windows.values {
            window.close()
        }
        windows.removeAll()
        buttons.removeAll()
        scrolls.removeAll()
        makeWindow(key: "a", origin: NSPoint(x: 40, y: 80), mark: "go-a")
        makeWindow(key: "b", origin: NSPoint(x: 560, y: 80), mark: "go-b")
    }

    func makeWindow(key: String, origin: NSPoint, mark: String) {
        let window = NSWindow(
            contentRect: NSRect(x: origin.x, y: origin.y, width: 460, height: 360),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = titles[key] ?? key
        window.isReleasedWhenClosed = false
        window.collectionBehavior = [.managed]
        window.level = .normal
        window.hidesOnDeactivate = false
        let button = MarkedButton(mark: mark, frame: NSRect(x: 24, y: 80, width: 120, height: 32))
        window.contentView?.addSubview(button)
        buttons[mark] = button
        if key == "a" {
            let fail = MarkedButton(
                mark: "go-fail",
                frame: NSRect(x: 160, y: 80, width: 120, height: 32),
                title: "Nope",
                countsPresses: false
            )
            window.contentView?.addSubview(fail)
            buttons["go-fail"] = fail
            let locked = NSTextField(frame: NSRect(x: 24, y: 40, width: 180, height: 24))
            locked.stringValue = "locked"
            locked.isEditable = false
            locked.isSelectable = false
            locked.isBezeled = false
            locked.drawsBackground = false
            locked.identifier = NSUserInterfaceItemIdentifier("locked")
            locked.setAccessibilityElement(true)
            locked.setAccessibilityIdentifier("locked")
            locked.setAccessibilityLabel("Locked")
            locked.setAccessibilityValue("locked")
            window.contentView?.addSubview(locked)
            let scrollA = MarkedScroll(mark: "scroll-a", frame: NSRect(x: 24, y: 180, width: 190, height: 110))
            let scrollB = MarkedScroll(mark: "scroll-b", frame: NSRect(x: 230, y: 180, width: 190, height: 110))
            window.contentView?.addSubview(scrollA)
            window.contentView?.addSubview(scrollB)
            scrolls["scroll-a"] = scrollA
            scrolls["scroll-b"] = scrollB
            let secret = NSSecureTextField(frame: NSRect(x: 24, y: 8, width: 220, height: 22))
            secret.stringValue = "vcu-secret-should-not-leak"
            secret.identifier = NSUserInterfaceItemIdentifier("secret")
            secret.setAccessibilityElement(true)
            secret.setAccessibilityIdentifier("secret")
            secret.setAccessibilityLabel("Password")
            window.contentView?.addSubview(secret)
        }
        window.orderFrontRegardless()
        windows[key] = window
    }

    func handle(_ cmd: String) {
        switch cmd {
        case "status":
            ack(statusBody())
        case "reorder":
            guard let a = windows["a"], let b = windows["b"] else {
                ack(["ok": false, "error": "missing window"])
                return
            }
            let af = a.frame
            let bf = b.frame
            a.setFrame(bf, display: true)
            b.setFrame(af, display: true)
            ack(statusBody())
        case "close-a":
            windows["a"]?.close()
            windows["a"] = nil
            ack(statusBody())
        case "close-b":
            windows["b"]?.close()
            windows["b"] = nil
            ack(statusBody())
        case "insert":
            guard let content = windows["a"]?.contentView else {
                ack(["ok": false, "error": "missing content"])
                return
            }
            let decoy = MarkedButton(mark: "go-decoy", frame: NSRect(x: 24, y: 130, width: 120, height: 32))
            content.addSubview(decoy, positioned: .below, relativeTo: nil)
            buttons["go-decoy"] = decoy
            ack(statusBody())
        case "replace":
            guard let content = windows["a"]?.contentView else {
                ack(["ok": false, "error": "missing content"])
                return
            }
            buttons["go-a"]?.removeFromSuperview()
            buttons["go-a"] = nil
            let replacement = MarkedButton(mark: "go-replaced", frame: NSRect(x: 24, y: 80, width: 120, height: 32))
            content.addSubview(replacement)
            buttons["go-replaced"] = replacement
            ack(statusBody())
        case "reset":
            rebuild()
            ack(statusBody())
        case "arm-hang":
            buttons["go-a"]?.armHang()
            ack(statusBody())
        case "arm-slow":
            buttons["go-a"]?.armSlow()
            ack(statusBody())
        case "arm-edge":
            buttons["go-a"]?.armEdge()
            ack(statusBody())
        default:
            ack(["ok": false, "error": "unknown command"])
        }
    }

    func statusBody() -> [String: Any] {
        var presses: [String: Int] = [:]
        for (mark, button) in buttons {
            presses[mark] = button.presses
        }
        var offsets: [String: Int] = [:]
        for (mark, scroll) in scrolls {
            scroll.publish()
            offsets[mark] = scroll.offset
        }
        return [
            "ok": true,
            "presses": presses,
            "offsets": offsets,
            "windows": [
                "a": windows["a"]?.windowNumber ?? 0,
                "b": windows["b"]?.windowNumber ?? 0,
            ],
        ]
    }

    func axRole(_ element: AXUIElement) -> String {
        var value: CFTypeRef?
        let err = AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &value)
        guard err == .success, let role = value as? String else { return "" }
        return role
    }

    func axWindowCount() -> Int {
        let app = AXUIElementCreateApplication(getpid())
        var value: CFTypeRef?
        let err = AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &value)
        guard err == .success, let windows = value as? [AXUIElement] else {
            return -Int(err.rawValue)
        }
        return windows.filter { axRole($0) == "AXWindow" }.count
    }

    func emitReady() {
        let body: [String: Any] = [
            "pid": Int(getpid()),
            "title_a": titles["a"] ?? "",
            "title_b": titles["b"] ?? "",
            "ax_windows": axWindowCount(),
            "cg_windows": windows.count,
        ]
        writeLine(body)
    }

    func ack(_ body: [String: Any]) {
        var line = body
        line["ack"] = true
        let data = try! JSONSerialization.data(withJSONObject: line)
        FileHandle.standardOutput.write(Data("ACK ".utf8))
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([0x0A]))
        fflush(stdout)
    }

    func writeLine(_ body: [String: Any]) {
        let data = try! JSONSerialization.data(withJSONObject: body)
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
