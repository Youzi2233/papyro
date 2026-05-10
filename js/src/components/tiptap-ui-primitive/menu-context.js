import { createContext, useContext } from "react"

export const SearchableContext = createContext(false)

export const MenuContext = createContext({
  isRootMenu: false,
  open: false,
})

export const useSearchableContext = () => {
  return useContext(SearchableContext);
}

export const useMenuContext = () => {
  return useContext(MenuContext);
}
