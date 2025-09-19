import { useState } from 'react'
import { Card } from '../ui/card'
import { Button } from '../ui/button'

export function Calculator() {
  const [display, setDisplay] = useState('0')
  const [previousValue, setPreviousValue] = useState<string | null>(null)
  const [operation, setOperation] = useState<string | null>(null)
  const [waitingForOperand, setWaitingForOperand] = useState(false)

  const inputNumber = (num: string) => {
    if (waitingForOperand) {
      setDisplay(num)
      setWaitingForOperand(false)
    } else {
      setDisplay(display === '0' ? num : display + num)
    }
  }

  const inputDecimal = () => {
    if (waitingForOperand) {
      setDisplay('0.')
      setWaitingForOperand(false)
    } else if (display.indexOf('.') === -1) {
      setDisplay(display + '.')
    }
  }

  const clear = () => {
    setDisplay('0')
    setPreviousValue(null)
    setOperation(null)
    setWaitingForOperand(false)
  }

  const performOperation = (nextOperation: string) => {
    const inputValue = parseFloat(display)

    if (previousValue === null) {
      setPreviousValue(display)
    } else if (operation) {
      const previousValueFloat = parseFloat(previousValue)
      let newValue: number

      switch (operation) {
        case '+':
          newValue = previousValueFloat + inputValue
          break
        case '-':
          newValue = previousValueFloat - inputValue
          break
        case '*':
          newValue = previousValueFloat * inputValue
          break
        case '/':
          newValue = inputValue !== 0 ? previousValueFloat / inputValue : 0
          break
        default:
          return
      }

      setDisplay(String(newValue))
      setPreviousValue(String(newValue))
    }

    setWaitingForOperand(true)
    setOperation(nextOperation)
  }

  const calculate = () => {
    if (operation && previousValue !== null) {
      performOperation('=')
      setPreviousValue(null)
      setOperation(null)
      setWaitingForOperand(true)
    }
  }

  const toggleSign = () => {
    const value = parseFloat(display)
    setDisplay(String(value * -1))
  }

  const percent = () => {
    const value = parseFloat(display)
    setDisplay(String(value / 100))
  }

  const buttonClass = "h-14 text-lg font-medium transition-all hover:scale-105 active:scale-95"
  const operatorClass = `${buttonClass} bg-primary hover:bg-primary/90 text-primary-foreground`
  const numberClass = `${buttonClass} bg-secondary hover:bg-secondary/80`
  const functionClass = `${buttonClass} bg-muted hover:bg-muted/80`

  return (
    <Card className="w-full max-w-sm mx-auto p-4 shadow-2xl">
      <div className="mb-4 p-4 bg-muted rounded-lg">
        <div className="text-right text-3xl font-mono font-bold text-foreground">
          {display}
        </div>
      </div>
      
      <div className="grid grid-cols-4 gap-2">
        <Button onClick={clear} className={`${functionClass} col-span-2`}>
          Clear
        </Button>
        <Button onClick={toggleSign} className={functionClass}>
          +/-
        </Button>
        <Button onClick={percent} className={functionClass}>
          %
        </Button>

        <Button onClick={() => inputNumber('7')} className={numberClass}>
          7
        </Button>
        <Button onClick={() => inputNumber('8')} className={numberClass}>
          8
        </Button>
        <Button onClick={() => inputNumber('9')} className={numberClass}>
          9
        </Button>
        <Button onClick={() => performOperation('/')} className={operatorClass}>
          ÷
        </Button>

        <Button onClick={() => inputNumber('4')} className={numberClass}>
          4
        </Button>
        <Button onClick={() => inputNumber('5')} className={numberClass}>
          5
        </Button>
        <Button onClick={() => inputNumber('6')} className={numberClass}>
          6
        </Button>
        <Button onClick={() => performOperation('*')} className={operatorClass}>
          ×
        </Button>

        <Button onClick={() => inputNumber('1')} className={numberClass}>
          1
        </Button>
        <Button onClick={() => inputNumber('2')} className={numberClass}>
          2
        </Button>
        <Button onClick={() => inputNumber('3')} className={numberClass}>
          3
        </Button>
        <Button onClick={() => performOperation('-')} className={operatorClass}>
          −
        </Button>

        <Button onClick={() => inputNumber('0')} className={`${numberClass} col-span-2`}>
          0
        </Button>
        <Button onClick={inputDecimal} className={numberClass}>
          .
        </Button>
        <Button onClick={() => performOperation('+')} className={operatorClass}>
          +
        </Button>

        <Button onClick={calculate} className={`${operatorClass} col-span-4`}>
          =
        </Button>
      </div>
    </Card>
  )
}