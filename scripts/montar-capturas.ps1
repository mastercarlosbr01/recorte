<#
    Monta as capturas de tela no formato exato da Chrome Web Store (1280x800).

    Print de tela sai em qualquer dimensao. Subir esticado ou com borda torta
    faz a listagem parecer amadora. Aqui a imagem e encaixada proporcionalmente
    sobre o fundo da marca, com margem e legenda opcional.

    A legenda vem do nome do arquivo: use "1 - Preenche o formulario inteiro.png"
    e vira o titulo da captura. O numero define a ordem.

    Uso:
      powershell -ExecutionPolicy Bypass -File scripts\montar-capturas.ps1 -Pasta "C:\...\prints"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$Pasta,

    [int]$Largura = 1280,
    [int]$Altura = 800
)

Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
$saida = Join-Path $raiz "dist\capturas"
if (Test-Path $saida) { Remove-Item $saida -Recurse -Force }
New-Item -ItemType Directory -Path $saida -Force | Out-Null

$NAVY = [System.Drawing.ColorTranslator]::FromHtml("#0F172A")
$CIANO = [System.Drawing.ColorTranslator]::FromHtml("#06B6D4")
$TEXTO = [System.Drawing.ColorTranslator]::FromHtml("#E6EDF6")
$FRACO = [System.Drawing.ColorTranslator]::FromHtml("#93A4BD")

$arquivos = Get-ChildItem "$Pasta\*" -Include *.png, *.jpg, *.jpeg | Sort-Object Name
if ($arquivos.Count -eq 0) { Write-Error "Nenhuma imagem em $Pasta"; exit 1 }
if ($arquivos.Count -gt 5) { Write-Warning "A loja aceita no maximo 5; as extras serao geradas mesmo assim." }

$indice = 1
foreach ($arq in $arquivos) {
    $origem = [System.Drawing.Image]::FromFile($arq.FullName)

    # legenda: tudo depois do primeiro " - ", sem extensao
    $nome = [System.IO.Path]::GetFileNameWithoutExtension($arq.Name)
    $legenda = if ($nome -match '^\s*\d+\s*-\s*(.+)$') { $Matches[1].Trim() } else { "" }

    # 24bpp sem alfa: a loja recusa PNG com canal alfa nas capturas
    $canvas = New-Object System.Drawing.Bitmap($Largura, $Altura, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($canvas)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $g.Clear($NAVY)

    # area util: sobra espaco no topo quando ha legenda
    $topo = if ($legenda) { 92 } else { 40 }
    $margem = 40
    $dispW = $Largura - ($margem * 2)
    $dispH = $Altura - $topo - $margem

    $escala = [Math]::Min($dispW / $origem.Width, $dispH / $origem.Height)
    # nao ampliar acima do tamanho original: esticar borra
    if ($escala -gt 1) { $escala = 1 }

    $w = [int]($origem.Width * $escala)
    $h = [int]($origem.Height * $escala)
    $x = [int](($Largura - $w) / 2)
    $y = [int]($topo + ($dispH - $h) / 2)

    # sombra discreta para descolar do fundo
    $sombra = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(70, 0, 0, 0))
    $g.FillRectangle($sombra, $x + 6, $y + 8, $w, $h)
    $sombra.Dispose()

    $g.DrawImage($origem, $x, $y, $w, $h)

    # moldura fina
    $caneta = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 148, 163, 184), 1)
    $g.DrawRectangle($caneta, $x, $y, $w - 1, $h - 1)
    $caneta.Dispose()

    if ($legenda) {
        $fonteTitulo = New-Object System.Drawing.Font("Segoe UI Semibold", 22, [System.Drawing.FontStyle]::Regular)
        $pincel = New-Object System.Drawing.SolidBrush($TEXTO)
        $formato = New-Object System.Drawing.StringFormat
        $formato.Alignment = [System.Drawing.StringAlignment]::Center
        $g.DrawString($legenda, $fonteTitulo, $pincel, ($Largura / 2), 30, $formato)

        # tracinho ciano sob o titulo
        $barra = New-Object System.Drawing.SolidBrush($CIANO)
        $g.FillRectangle($barra, ($Largura / 2) - 26, 72, 52, 3)
        $barra.Dispose()

        $fonteTitulo.Dispose(); $pincel.Dispose(); $formato.Dispose()
    }

    $g.Dispose()
    $destino = Join-Path $saida ("captura-{0}.png" -f $indice)
    $canvas.Save($destino, [System.Drawing.Imaging.ImageFormat]::Png)
    $canvas.Dispose()
    $origem.Dispose()

    $kb = [Math]::Round((Get-Item $destino).Length / 1KB, 0)
    $rot = if ($legenda) { $legenda } else { "(sem legenda)" }
    Write-Host ("  captura-{0}.png  {1}x{2}  {3} KB   {4}" -f $indice, $Largura, $Altura, $kb, $rot)
    $indice++
}

Write-Host ""
Write-Host "  prontas em dist\capturas — suba nessa ordem na ficha da loja"
Write-Host ""
