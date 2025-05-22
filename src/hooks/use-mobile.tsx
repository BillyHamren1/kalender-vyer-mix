
import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
  )

  React.useEffect(() => {
    // Set initial value
    const checkIfMobile = () => {
      return window.innerWidth < MOBILE_BREAKPOINT
    }
    
    setIsMobile(checkIfMobile())
    
    // Add event listener for window resize
    const handleResize = () => {
      setIsMobile(checkIfMobile())
    }
    
    window.addEventListener('resize', handleResize)
    
    // Clean up
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return isMobile
}
