Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 256,256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$rect = New-Object System.Drawing.Rectangle 0,0,256,256
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(255,249,115,22), [System.Drawing.Color]::FromArgb(255,234,88,12), 45)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0,0,64,64,180,90)
$path.AddArc(192,0,64,64,270,90)
$path.AddArc(192,192,64,64,0,90)
$path.AddArc(0,192,64,64,90,90)
$path.CloseFigure()
$g.FillPath($brush, $path)
$white = [System.Drawing.Brushes]::White
$g.FillRectangle($white, 76, 60, 24, 100)
$g.FillRectangle($white, 116, 40, 24, 140)
$g.FillRectangle($white, 156, 76, 24, 68)
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 14)
$pen.StartCap = 'Round'
$pen.EndCap = 'Round'
$g.DrawArc($pen, 66, 90, 124, 100, 20, 140)
$g.DrawLine($pen, 128, 190, 128, 216)
$out = Join-Path $PSScriptRoot 'icon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Output "saved $out"
