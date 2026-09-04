// Вырезает человека из PNG-кадров средствами Apple Vision.
// Использование: cutout <входная-папка> <выходная-папка>
import Foundation
import Vision
import CoreImage
import CoreVideo

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write("usage: cutout <inDir> <outDir>\n".data(using: .utf8)!)
    exit(2)
}

let inDir = URL(fileURLWithPath: args[1])
let outDir = URL(fileURLWithPath: args[2])
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

let ctx = CIContext(options: [.useSoftwareRenderer: false])
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!

let files = try FileManager.default
    .contentsOfDirectory(at: inDir, includingPropertiesForKeys: nil)
    .filter { $0.pathExtension.lowercased() == "png" }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }

var done = 0
for url in files {
    guard let img = CIImage(contentsOf: url) else { continue }

    let request = VNGeneratePersonSegmentationRequest()
    request.qualityLevel = .accurate
    request.outputPixelFormat = kCVPixelFormatType_OneComponent8

    let handler = VNImageRequestHandler(ciImage: img, options: [:])
    try handler.perform([request])

    guard let buffer = request.results?.first?.pixelBuffer else {
        FileHandle.standardError.write("no mask: \(url.lastPathComponent)\n".data(using: .utf8)!)
        continue
    }

    // Маска приходит меньшего размера — растягиваем до кадра.
    var mask = CIImage(cvPixelBuffer: buffer)
    let sx = img.extent.width / mask.extent.width
    let sy = img.extent.height / mask.extent.height
    mask = mask.transformed(by: CGAffineTransform(scaleX: sx, y: sy))

    // Слегка размываем край, чтобы не было «пилы» по контуру.
    mask = mask.applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: 1.1])
               .cropped(to: img.extent)

    let clear = CIImage(color: CIColor.clear).cropped(to: img.extent)
    guard let blended = CIFilter(name: "CIBlendWithMask", parameters: [
        kCIInputImageKey: img,
        kCIInputBackgroundImageKey: clear,
        kCIInputMaskImageKey: mask,
    ])?.outputImage else { continue }

    let out = blended.cropped(to: img.extent)
    try ctx.writePNGRepresentation(of: out, to: outDir.appendingPathComponent(url.lastPathComponent),
                                   format: .RGBA8, colorSpace: srgb)
    done += 1
}

print("cutout: \(done)/\(files.count)")
