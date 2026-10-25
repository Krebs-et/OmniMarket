"use client";

import { createContext, useContext } from "react";
import { can, type Permission, type Role } from "@domain/value-objects/role";

const RoleContext = createContext<Role>("viewer");

export const RoleProvider = RoleContext.Provider;
export const useRole = () => useContext(RoleContext);
export const useCan = (permission: Permission) => can(useRole(), permission);
