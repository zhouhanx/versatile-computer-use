import AppKit
import ApplicationServices
import Foundation

final class MarkedButton: NSButton {
    let mark: String
    var presses = 0

    init(mark: String, frame: NSRect) {
        self.mark = mark
        super.init(frame: frame)
        title = "Go"
        bezelStyle = .rounded
        setButtonType(.momentaryPushIn)
        identifier = NSUserInterfaceItemIdentifier(mark)
        target = self
        action = #selector(notePress)
        setAccessibilityElement(true)
        setAccessibilityIdentifier(mark)
        setAccessibilityLabel("Go")
        setAccessibilityTitle("Go")
        setAccessibilityHelp(mark)
    }

    required init?(coder: NSCoder) { nil }

    override func accessibilityIdentifier() -> String { mark }

    override func accessibilityValue() -> Any? { mark }

    private var lastPress = Date.distantPast

    @objc func notePress() {
        let now = Date()
        if now.timeIntervalSince(lastPress) < 0.05 { return }
        lastPress = now
        presses += 1
    }

    override func accessibilityPerformPress() -> Bool {
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
