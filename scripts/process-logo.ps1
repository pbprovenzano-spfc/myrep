param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [int]$Threshold = 240,
  [int]$FaviconSize = 180
)

Add-Type -AssemblyName System.Drawing

function Test-BackgroundPixel {
  param([System.Drawing.Color]$Color, [int]$Threshold)
  if ($Color.R -ge $Threshold -and $Color.G -ge $Threshold -and $Color.B -ge $Threshold) {
    return $true
  }
  # Matte preto nas bordas (exportações com fundo preto em vez de branco)
  if ($Color.R -le 25 -and $Color.G -le 25 -and $Color.B -le 25) {
    return $true
  }
  return $false
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$img = [System.Drawing.Image]::FromFile($Source)
$w = $img.Width
$h = $img.Height
$bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.DrawImage($img, 0, 0, $w, $h)
$g.Dispose()
$img.Dispose()

$visited = New-Object 'bool[]' ($w * $h)
$queue = [System.Collections.Generic.Queue[int[]]]::new()

function Enqueue-IfBackground {
  param([int]$X, [int]$Y)
  $idx = $Y * $w + $X
  if ($visited[$idx]) { return }
  $c = $bmp.GetPixel($X, $Y)
  if (Test-BackgroundPixel -Color $c -Threshold $Threshold) {
    $visited[$idx] = $true
    $queue.Enqueue(@($X, $Y))
  }
}

for ($x = 0; $x -lt $w; $x++) {
  Enqueue-IfBackground -X $x -Y 0
  Enqueue-IfBackground -X $x -Y ($h - 1)
}
for ($y = 0; $y -lt $h; $y++) {
  Enqueue-IfBackground -X 0 -Y $y
  Enqueue-IfBackground -X ($w - 1) -Y $y
}

$dirs = @(@(1, 0), @(-1, 0), @(0, 1), @(0, -1))
while ($queue.Count -gt 0) {
  $p = $queue.Dequeue()
  $x = $p[0]
  $y = $p[1]
  $c = $bmp.GetPixel($x, $y)
  $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $c.R, $c.G, $c.B))

  foreach ($d in $dirs) {
    $nx = $x + $d[0]
    $ny = $y + $d[1]
    if ($nx -lt 0 -or $nx -ge $w -or $ny -lt 0 -or $ny -ge $h) { continue }
    $nidx = $ny * $w + $nx
    if ($visited[$nidx]) { continue }
    $nc = $bmp.GetPixel($nx, $ny)
    if (Test-BackgroundPixel -Color $nc -Threshold $Threshold) {
      $visited[$nidx] = $true
      $queue.Enqueue(@($nx, $ny))
    }
  }
}

$logoPath = Join-Path $OutDir "logo.png"
$bmp.Save($logoPath, [System.Drawing.Imaging.ImageFormat]::Png)

$fav = New-Object System.Drawing.Bitmap $FaviconSize, $FaviconSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$fg = [System.Drawing.Graphics]::FromImage($fav)
$fg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$fg.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$fg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$fg.DrawImage($bmp, 0, 0, $FaviconSize, $FaviconSize)
$fg.Dispose()

$favPath = Join-Path $OutDir "favicon.png"
$fav.Save($favPath, [System.Drawing.Imaging.ImageFormat]::Png)

$bmp.Dispose()
$fav.Dispose()

Write-Output "Wrote $logoPath"
Write-Output "Wrote $favPath"
