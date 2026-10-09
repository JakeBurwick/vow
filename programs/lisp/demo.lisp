; demo.lisp: run by an interpreter written in Vow

(define (fact n) (if (= n 0) 1 (* n (fact (- n 1)))))
(display "10! =" (fact 10))

(define (fib n) (if (< n 2) n (+ (fib (- n 1)) (fib (- n 2)))))
(display "fib 20 =" (fib 20))

; higher-order functions, written in Lisp itself
(define (map f xs) (if (null? xs) '() (cons (f (car xs)) (map f (cdr xs)))))
(define (filter p xs)
  (if (null? xs) '()
      (if (p (car xs)) (cons (car xs) (filter p (cdr xs))) (filter p (cdr xs)))))
(define (fold f acc xs) (if (null? xs) acc (fold f (f acc (car xs)) (cdr xs))))
(define (range a b) (if (>= a b) '() (cons a (range (+ a 1) b))))

(display "squares:" (map (lambda (x) (* x x)) (range 1 11)))
(display "evens:" (filter (lambda (x) (= (mod x 2) 0)) (range 1 21)))
(display "sum 1..100 =" (fold + 0 (range 1 101)))

; closures: each counter keeps its own private state
(define (make-counter)
  (let ((n 0))
    (lambda () (set! n (+ n 1)) n)))
(define a (make-counter))
(define b (make-counter))
(a) (a) (a) (b)
(display "counter a:" (a) " counter b:" (b))

; primes with a sieve-ish filter
(define (prime? n)
  (define (check d) (if (> (* d d) n) #t (if (= (mod n d) 0) #f (check (+ d 1)))))
  (and (> n 1) (check 2)))
(display "primes < 60:" (filter prime? (range 1 60)))

; errors are values in Vow, so each one is reported and the program keeps going
(car '())
(undefined-thing 1 2)
(fact 1 2)
(/ 10 0)
(display "still running after 4 errors")
