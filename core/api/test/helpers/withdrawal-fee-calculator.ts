export const generateTxSizeCases = (matrix: number[][]): [number, number, number][] => {
  const testCases: [number, number, number][] = []

  matrix.forEach((row, outputIndex) => {
    row.forEach((expectedSize, inputIndex) => {
      const inputs = inputIndex + 1
      const outputs = outputIndex + 1
      testCases.push([inputs, outputs, expectedSize])
    })
  })

  return testCases.sort((a, b) => a[2] - b[2])
}
