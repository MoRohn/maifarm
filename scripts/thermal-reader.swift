#!/usr/bin/env swift
// Thermal Reader for MaiFarm
// Reads thermal state from macOS notifyd without requiring root access

import Foundation

@_silgen_name("notify_register_check")
private func notify_register_check(
  _ name: UnsafePointer<CChar>, _ token: UnsafeMutablePointer<Int32>
) -> UInt32

@_silgen_name("notify_get_state")
private func notify_get_state(_ token: Int32, _ state: UnsafeMutablePointer<UInt64>) -> UInt32

@_silgen_name("notify_cancel")
private func notify_cancel(_ token: Int32) -> UInt32

struct ThermalInfo: Codable {
    let pressureLevel: Int
    let pressureLabel: String
    let timestamp: String
}

func getThermalState() -> ThermalInfo {
    let notifyOK: UInt32 = 0
    let name = "com.apple.system.thermalpressurelevel"

    var token: Int32 = 0
    let reg = name.withCString { notify_register_check($0, &token) }

    guard reg == notifyOK else {
        return ThermalInfo(pressureLevel: -1, pressureLabel: "error", timestamp: ISO8601DateFormatter().string(from: Date()))
    }

    defer { _ = notify_cancel(token) }

    var state: UInt64 = 0
    let got = notify_get_state(token, &state)

    guard got == notifyOK else {
        return ThermalInfo(pressureLevel: -1, pressureLabel: "error", timestamp: ISO8601DateFormatter().string(from: Date()))
    }

    let label: String
    switch state {
    case 0: label = "nominal"
    case 1: label = "moderate"
    case 2: label = "heavy"
    case 3: label = "trapping"
    case 4: label = "sleeping"
    default: label = "unknown"
    }

    return ThermalInfo(pressureLevel: Int(state), pressureLabel: label, timestamp: ISO8601DateFormatter().string(from: Date()))
}

let info = getThermalState()
let encoder = JSONEncoder()
if let jsonData = try? encoder.encode(info),
   let jsonString = String(data: jsonData, encoding: .utf8) {
    print(jsonString)
}
