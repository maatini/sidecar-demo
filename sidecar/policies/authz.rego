package sidecar.authz

default allow = false

roles := object.get(input, "roles", [])
method := lower(object.get(input, "method", "get"))
path := object.get(input, "path", "/")

is_admin {
  roles[_] == "admin"
}

is_customer {
  roles[_] == "customer"
}

allow {
  startswith(path, "/api/orders")
  method == "get"
  is_customer
}

allow {
  startswith(path, "/api/orders")
  method == "get"
  is_admin
}

allow {
  startswith(path, "/api/profile")
  method == "get"
  is_customer
}

allow {
  startswith(path, "/api/profile")
  method == "get"
  is_admin
}

allow {
  startswith(path, "/api/admin")
  is_admin
}

deny_reason := "missing_required_role_for_resource" {
  not allow
}
