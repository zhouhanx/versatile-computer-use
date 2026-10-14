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

final class FixtureDelegate: NSObject, NSApplicationDelegate {
    var windows: [String: NSWindow] = [:]
    var buttons: [String: MarkedButton] = [:]
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
        makeWindow(key: "a", origin: NSPoint(x: 40, y: 80), mark: "go-a")
        makeWindow(key: "b", origin: NSPoint(x: 460, y: 80), mark: "go-b")
    }

    func makeWindow(key: String, origin: NSPoint, mark: String) {
        let window = NSWindow(
            contentRect: NSRect(x: origin.x, y: origin.y, width: 360, height: 240),
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
        return [
            "ok": true,
            "presses": presses,
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
