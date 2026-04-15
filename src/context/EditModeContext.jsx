import { createContext, useContext, useState } from 'react'

export const EditModeContext = createContext({ isEditing: false, setIsEditing: () => {} })

export function EditModeProvider({ children }) {
  const [isEditing, setIsEditing] = useState(false)
  return (
    <EditModeContext.Provider value={{ isEditing, setIsEditing }}>
      {children}
    </EditModeContext.Provider>
  )
}

export function useEditMode() {
  return useContext(EditModeContext)
}
