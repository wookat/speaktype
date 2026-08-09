Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 256,256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$rect = New-Object System.Drawing.Rectangle 0,0,256,256
# SpeakType 品牌色：靛紫渐变（#6366F1 → #8B5CF6）
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(255,99,102,241), [System.Drawing.Color]::FromArgb(255,139,92,246), 45)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0,0,72,72,180,90)
$path.AddArc(184,0,72,72,270,90)
$path.AddArc(184,184,72,72,0,90)
$path.AddArc(0,184,72,72,90,90)
$path.CloseFigure()
$g.FillPath($brush, $path)
# 声波条：5 根圆头白条，中间最高，构成 SpeakType 的「声纹」标识
$white = [System.Drawing.Brushes]::White
function Add-Bar([int]$x, [int]$h) {
  $y = [int]((256 - $h) / 2)
  $barPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $barPath.AddArc($x, $y, 22, 22, 180, 180)
  $barPath.AddArc($x, $y + $h - 22, 22, 22, 0, 180)
  $barPath.CloseFigure()
  $script:g.FillPath($script:white, $barPath)
}
Add-Bar 52 64
Add-Bar 90 116
Add-Bar 128 168
Add-Bar 166 116
Add-Bar 204 64
$out = Join-Path $PSScriptRoot 'icon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output "saved $out"
