param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$wordCheck = $null
$checkDocument = $null
try {
  $wordCheck = New-Object -ComObject Word.Application
  $wordCheck.Visible = $false
  $wordCheck.DisplayAlerts = 0
  # Validate the exact clipboard HTML using Word's HTML importer. The test
  # runner may lack access to an interactive Windows clipboard.
  $checkDocument = $wordCheck.Documents.Open((Join-Path $OutputDirectory 'payload.html'), $false, $true)
  $checkDocument.Repaginate()
  [xml]$checkXml = $checkDocument.Content.WordOpenXML
  $ns = New-Object Xml.XmlNamespaceManager($checkXml.NameTable)
  $ns.AddNamespace('m', 'http://schemas.openxmlformats.org/officeDocument/2006/math')
  $ns.AddNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
  $numbered = $checkXml.SelectNodes('//m:eqArr[m:eqArrPr/m:maxDist[@m:val="1"]]', $ns)
  if ($numbered.Count -ne 3) { throw "Expected 3 native numbered equations; got $($numbered.Count)" }
  if ($checkDocument.Tables.Count -ne 0) { throw 'Unexpected Word layout table' }
  $expected = @('(1)', '(2.3)', '固定编号')
  for ($index = 0; $index -lt $numbered.Count; $index++) {
    $text = ($numbered[$index].SelectNodes('.//m:t', $ns) | ForEach-Object { $_.InnerText }) -join ''
    if (!$text.Contains('#' + $expected[$index])) { throw "Missing fixed number: $text" }
  }
  if ($checkXml.SelectNodes('//m:f', $ns).Count -lt 1) { throw 'Fraction lost during paste' }
  if ($checkXml.SelectNodes('//m:sSub', $ns).Count -lt 1) { throw 'Subscript lost during paste' }
  if ($checkXml.SelectNodes('//m:acc', $ns).Count -lt 2) { throw 'Dot accents lost during import' }
  if ($checkXml.SelectNodes('//m:oMath[not(ancestor::m:oMath)]', $ns).Count -ne 11) { throw 'Inline or display equation lost during paste' }
  if (!$checkDocument.Content.Text.Contains('体积守恒关系')) { throw 'Manuscript text lost during paste' }
  [IO.File]::WriteAllText((Join-Path $OutputDirectory 'pasted.xml'), $checkXml.OuterXml)
  $checkDocument.ExportAsFixedFormat((Join-Path $OutputDirectory 'pasted.pdf'), 17)
  Write-Output "Word $($wordCheck.Version): native fixed numbering, formulas and prose passed; no layout tables"
} finally {
  if ($checkDocument) { $checkDocument.Close(0) }
  if ($wordCheck) { $wordCheck.Quit() }
}
