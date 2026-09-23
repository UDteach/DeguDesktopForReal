import AppKit
import AVFoundation

@MainActor
final class DeguAppDelegate: NSObject, NSApplicationDelegate {
    private struct Clip {
        let name: String
        let filename: String
        let anchor: Anchor
    }

    private enum Anchor {
        case bottomCenter
        case bottomRight
        case bottomLeft
    }

    private enum Frequency: Int, CaseIterable {
        case frequent
        case normal
        case occasional

        var title: String {
            switch self {
            case .frequent: "3〜6分ごと"
            case .normal: "5〜10分ごと"
            case .occasional: "10〜20分ごと"
            }
        }

        var delay: ClosedRange<Double> {
            switch self {
            case .frequent: 180...360
            case .normal: 300...600
            case .occasional: 600...1200
            }
        }
    }

    private enum DisplaySize: Int, CaseIterable {
        case small = 3
        case standard = 0
        case large = 1
        case extraLarge = 2

        var title: String {
            switch self {
            case .small: "小さめ"
            case .standard: "標準"
            case .large: "大きめ"
            case .extraLarge: "特大"
            }
        }

        var scale: CGFloat {
            switch self {
            case .small: 0.45
            case .standard: 0.60
            case .large: 0.80
            case .extraLarge: 1.0
            }
        }
    }

    private let clips = [
        Clip(name: "下からぴょこ", filename: "agouti-a-bottom-pop.mov", anchor: .bottomCenter),
        Clip(name: "右からのぞく", filename: "agouti-b-side-peek.mov", anchor: .bottomRight),
        Clip(name: "左下から跳び込む", filename: "agouti-c-center-hop.mov", anchor: .bottomLeft)
    ]

    private let frequencyKey = "appearanceFrequency"
    private let displaySizeKey = "displaySize"

    private var frequency: Frequency = .normal
    private var displaySize: DisplaySize = .standard
    private var isPaused = false
    private var lastClipIndex: Int?

    private var statusItem: NSStatusItem?
    private var pauseItem: NSMenuItem?
    private var frequencyItems: [Frequency: NSMenuItem] = [:]
    private var sizeItems: [DisplaySize: NSMenuItem] = [:]

    private var nextAppearanceTimer: Timer?
    private var playbackTimeout: Timer?
    private var overlayWindow: NSPanel?
    private var player: AVPlayer?
    private var currentItem: AVPlayerItem?

    override init() {
        super.init()
        let defaults = UserDefaults.standard
        if let value = defaults.object(forKey: frequencyKey) as? Int {
            frequency = Frequency(rawValue: value) ?? .normal
        }
        if let value = defaults.object(forKey: displaySizeKey) as? Int {
            displaySize = DisplaySize(rawValue: value) ?? .standard
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        configureStatusMenu()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            self?.playNextClip()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        nextAppearanceTimer?.invalidate()
        stopPlayback()
    }

    private func configureStatusMenu() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = item.button {
            if let image = NSImage(systemSymbolName: "pawprint.fill", accessibilityDescription: "デグー") {
                image.isTemplate = true
                button.image = image
            } else {
                button.title = "Degu"
            }
            button.toolTip = "Degu Gatekeeper"
        }

        let menu = NSMenu()
        let showNow = NSMenuItem(title: "今すぐ表示", action: #selector(showNowClicked), keyEquivalent: "")
        showNow.target = self
        menu.addItem(showNow)

        let pause = NSMenuItem(title: "一時停止", action: #selector(pauseClicked), keyEquivalent: "")
        pause.target = self
        menu.addItem(pause)
        pauseItem = pause

        menu.addItem(.separator())
        let frequencyMenu = NSMenu()
        for choice in Frequency.allCases {
            let option = NSMenuItem(title: choice.title, action: #selector(frequencyClicked(_:)), keyEquivalent: "")
            option.target = self
            option.representedObject = choice.rawValue
            frequencyMenu.addItem(option)
            frequencyItems[choice] = option
        }
        let frequencyParent = NSMenuItem(title: "出現間隔", action: nil, keyEquivalent: "")
        frequencyParent.submenu = frequencyMenu
        menu.addItem(frequencyParent)

        let sizeMenu = NSMenu()
        for choice in DisplaySize.allCases {
            let option = NSMenuItem(title: choice.title, action: #selector(sizeClicked(_:)), keyEquivalent: "")
            option.target = self
            option.representedObject = choice.rawValue
            sizeMenu.addItem(option)
            sizeItems[choice] = option
        }
        let sizeParent = NSMenuItem(title: "表示サイズ", action: nil, keyEquivalent: "")
        sizeParent.submenu = sizeMenu
        menu.addItem(sizeParent)
        updateMenuChecks()

        menu.addItem(.separator())
        let quit = NSMenuItem(title: "終了", action: #selector(quitClicked), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)

        item.menu = menu
        statusItem = item
    }

    private func updateMenuChecks() {
        for (choice, item) in frequencyItems {
            item.state = choice == frequency ? .on : .off
        }
        for (choice, item) in sizeItems {
            item.state = choice == displaySize ? .on : .off
        }
        pauseItem?.title = isPaused ? "再開" : "一時停止"
    }

    @objc private func showNowClicked() {
        isPaused = false
        updateMenuChecks()
        playNextClip()
    }

    @objc private func pauseClicked() {
        isPaused.toggle()
        updateMenuChecks()
        if isPaused {
            nextAppearanceTimer?.invalidate()
            stopPlayback()
        } else {
            scheduleNextAppearance()
        }
    }

    @objc private func frequencyClicked(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? Int,
              let choice = Frequency(rawValue: raw) else { return }
        frequency = choice
        UserDefaults.standard.set(choice.rawValue, forKey: frequencyKey)
        updateMenuChecks()
        if overlayWindow == nil { scheduleNextAppearance() }
    }

    @objc private func sizeClicked(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? Int,
              let choice = DisplaySize(rawValue: raw) else { return }
        displaySize = choice
        UserDefaults.standard.set(choice.rawValue, forKey: displaySizeKey)
        updateMenuChecks()
        // The new size is applied the next time a clip appears.
    }

    @objc private func quitClicked() {
        NSApp.terminate(nil)
    }

    @objc private func appearanceTimerFired() {
        playNextClip()
    }

    @objc private func playbackEnded(_ notification: Notification) {
        finishPlayback()
    }

    @objc private func playbackTimedOut() {
        finishPlayback()
    }

    private func scheduleNextAppearance() {
        nextAppearanceTimer?.invalidate()
        nextAppearanceTimer = nil
        guard !isPaused else { return }
        let seconds = Double.random(in: frequency.delay)
        nextAppearanceTimer = Timer.scheduledTimer(
            timeInterval: seconds,
            target: self,
            selector: #selector(appearanceTimerFired),
            userInfo: nil,
            repeats: false
        )
    }

    private func chooseClipIndex() -> Int {
        let available = clips.indices.filter { $0 != lastClipIndex }
        return available.randomElement() ?? 0
    }

    private func playNextClip() {
        guard !isPaused else { return }
        nextAppearanceTimer?.invalidate()
        nextAppearanceTimer = nil
        stopPlayback()

        let index = chooseClipIndex()
        let clip = clips[index]
        guard let url = Bundle.main.url(forResource: clip.filename, withExtension: nil, subdirectory: "Videos") else {
            NSLog("Missing bundled video: %@", clip.filename)
            scheduleNextAppearance()
            return
        }
        lastClipIndex = index

        let point = NSEvent.mouseLocation
        guard let screen = NSScreen.screens.first(where: { $0.frame.contains(point) }) ?? NSScreen.main else {
            scheduleNextAppearance()
            return
        }

        let item = AVPlayerItem(url: url)
        let player = AVPlayer(playerItem: item)
        player.actionAtItemEnd = .pause

        let window = NSPanel(
            contentRect: screen.frame,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false,
            screen: screen
        )
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.ignoresMouseEvents = true
        window.hidesOnDeactivate = false
        window.isFloatingPanel = true
        window.level = .screenSaver
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        window.animationBehavior = .none

        let view = NSView(frame: NSRect(origin: .zero, size: screen.frame.size))
        view.wantsLayer = true
        view.layer?.backgroundColor = NSColor.clear.cgColor

        let videoLayer = AVPlayerLayer(player: player)
        videoLayer.isOpaque = false
        videoLayer.backgroundColor = NSColor.clear.cgColor
        videoLayer.videoGravity = .resizeAspectFill
        let scale = displaySize.scale
        let videoSize = NSSize(width: view.bounds.width * scale, height: view.bounds.height * scale)
        let origin: NSPoint
        switch clip.anchor {
        case .bottomCenter:
            origin = NSPoint(x: (view.bounds.width - videoSize.width) / 2, y: 0)
        case .bottomRight:
            origin = NSPoint(x: view.bounds.width - videoSize.width, y: 0)
        case .bottomLeft:
            origin = .zero
        }
        videoLayer.frame = NSRect(origin: origin, size: videoSize)
        view.layer?.addSublayer(videoLayer)
        window.contentView = view

        overlayWindow = window
        currentItem = item
        self.player = player
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(playbackEnded(_:)),
            name: .AVPlayerItemDidPlayToEndTime,
            object: item
        )
        window.orderFrontRegardless()
        player.play()

        // A failed decoder should never leave a full-screen window in place.
        playbackTimeout = Timer.scheduledTimer(
            timeInterval: 8,
            target: self,
            selector: #selector(playbackTimedOut),
            userInfo: nil,
            repeats: false
        )
    }

    private func finishPlayback() {
        stopPlayback()
        scheduleNextAppearance()
    }

    private func stopPlayback() {
        playbackTimeout?.invalidate()
        playbackTimeout = nil
        if let item = currentItem {
            NotificationCenter.default.removeObserver(self, name: .AVPlayerItemDidPlayToEndTime, object: item)
        }
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        overlayWindow?.orderOut(nil)
        overlayWindow?.close()
        overlayWindow = nil
        player = nil
        currentItem = nil
    }
}

MainActor.assumeIsolated {
    let application = NSApplication.shared
    let delegate = DeguAppDelegate()
    application.delegate = delegate
    application.run()
}
