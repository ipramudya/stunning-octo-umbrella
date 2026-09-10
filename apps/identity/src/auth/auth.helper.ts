import {
  password as validPassword,
  phone,
} from '../employee/employee.helper.js';

export function validateLogin(phoneNumber: string, password: string) {
  return { phoneNumber: phone(phoneNumber), password: validPassword(password) };
}
